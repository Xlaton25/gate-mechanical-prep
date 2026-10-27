-- pgTAP checks for a FUTURE local Supabase run (`supabase test db`). NOT executed yet.
-- All data below is unmistakably synthetic and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- RLS on every exposed table
select ok(bool_and(c.relrowsecurity), 'RLS enabled on all public tables')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r';

-- No anon privileges anywhere in public/private
select is((select count(*)::int from information_schema.role_table_grants
            where grantee = 'anon' and table_schema in ('public','private')), 0, 'anon has no table grants');
select is((select count(*)::int from information_schema.role_table_grants
            where grantee = 'authenticated' and table_schema = 'private'), 0, 'authenticated has no private grants');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use private schema');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use private schema');

-- Learners cannot write progress
select ok(not has_table_privilege('authenticated', 'public.attempts', 'insert'), 'no attempt insert');
select ok(not has_table_privilege('authenticated', 'public.attempts', 'update'), 'no attempt update');
select ok(not has_table_privilege('authenticated', 'public.daily_assignments', 'insert'), 'no assignment insert');
select ok(not has_table_privilege('authenticated', 'public.revision_items', 'insert'), 'no revision insert');
select ok(not has_table_privilege('authenticated', 'public.questions', 'insert'), 'no question insert');
select ok(not has_column_privilege('authenticated', 'public.user_preferences', 'user_id', 'update'), 'cannot reassign prefs owner');

-- Synthetic fixtures (service role / owner context)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'synthetic-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'synthetic-b@example.invalid');
insert into public.papers (id, exam_year, session_label, marking_policy_id, status) values
  ('00000000-0000-0000-0000-00000000p001'::text::uuid, 2027, 'SYNTHETIC', 'gate-2027-v1', 'published');
insert into public.questions (id, paper_id, number, type, marks, body_md, validation_state, validated_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000p001'::text::uuid, 1, 'NAT', 2, 'SYNTHETIC validated', 'validated', now()),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000p001'::text::uuid, 2, 'MCQ', 1, 'SYNTHETIC draft', 'unvalidated', null);
insert into private.answer_keys (id, question_id, question_type, version, provenance) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'NAT', 1, 'unknown');

-- 2027 policy cannot attach to a 2007 paper
select throws_ok($$insert into public.papers (exam_year, session_label, marking_policy_id) values (2007, 'SYN', 'gate-2027-v1')$$,
  '23503', null, '2027 policy rejected for 2007 paper');

-- NAT ranges: disjoint allowed, overlap/touch rejected
insert into private.answer_key_nat_ranges values
  ('00000000-0000-0000-0000-0000000000d1', 1, -2.5, -1.5),
  ('00000000-0000-0000-0000-0000000000d1', 2, 3.1, 3.2);
select is((select count(*)::int from private.answer_key_nat_ranges where key_id = '00000000-0000-0000-0000-0000000000d1'), 2, 'gap preserved: two ranges');
select throws_ok($$insert into private.answer_key_nat_ranges values ('00000000-0000-0000-0000-0000000000d1', 3, 3.2, 4)$$,
  '23P01', null, 'touching NAT range rejected');
select throws_ok($$insert into private.answer_key_nat_ranges values ('00000000-0000-0000-0000-0000000000d1', 4, 5, 4)$$,
  '23514', null, 'inverted NAT range rejected');
select throws_ok($$insert into private.answer_keys (question_id, question_type, version, provenance) values ('00000000-0000-0000-0000-0000000000c1','MCQ',2,'unknown')$$,
  '23503', null, 'key type must match question type');

-- Idempotent daily assignment
insert into public.daily_assignments (user_id, study_day, timezone, reset_time, generator_version)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-10-28', 'Asia/Kolkata', '04:00', 'synthetic');
select throws_ok($$insert into public.daily_assignments (user_id, study_day, timezone, reset_time, generator_version)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-10-28', 'Asia/Kolkata', '04:00', 'synthetic')$$,
  '23505', null, 'one assignment per user per study day');

insert into public.attempts (user_id, question_id, response, status, marks_thirds, key_version_id, marking_policy_id)
  values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', '{"kind":"NAT","value":"3.15"}', 'correct', 6,
          '00000000-0000-0000-0000-0000000000d1', 'gate-2027-v1');

-- As learner A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.questions), 1, 'learner sees only validated questions');
select is((select count(*)::int from public.attempts), 0, 'learner cannot see another user''s attempts');
select is((select count(*)::int from public.daily_assignments), 1, 'learner sees own assignment');
select throws_ok($$select * from private.answer_keys$$, '42501', null, 'learner cannot read keys');
reset role;

select * from finish();
rollback;
