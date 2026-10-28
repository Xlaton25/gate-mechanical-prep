-- pgTAP checks for a FUTURE local Supabase run (`supabase test db`). NOT executed yet.
-- Requires migrations 000001–000003. All data is unmistakably synthetic and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ===== Privileges / RLS =====
select ok(bool_and(c.relrowsecurity), 'RLS enabled on all public tables')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r';
select is((select count(*)::int from information_schema.role_table_grants
            where grantee = 'anon' and table_schema in ('public','private')), 0, 'anon has no table grants');
select is((select count(*)::int from information_schema.role_table_grants
            where grantee = 'authenticated' and table_schema = 'private'), 0, 'authenticated has no private grants');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use private schema');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use private schema');
select ok(not has_table_privilege('authenticated', 'public.attempts', 'insert'), 'no attempt insert');
select ok(not has_table_privilege('authenticated', 'public.attempts', 'update'), 'no attempt update');
select ok(not has_table_privilege('authenticated', 'public.daily_assignments', 'insert'), 'no assignment insert');
select ok(not has_table_privilege('authenticated', 'public.revision_items', 'insert'), 'no revision insert');
select ok(not has_table_privilege('authenticated', 'public.questions', 'insert'), 'no question insert');
select ok(not has_column_privilege('authenticated', 'public.user_preferences', 'user_id', 'update'), 'cannot reassign prefs owner');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public','private') and p.prosecdef), 0, 'no security-definer functions');

-- ===== Synthetic fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'synthetic-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'synthetic-b@example.invalid');
insert into public.marking_policies (id, exam_year, verified, mcq_penalty_thirds_1, mcq_penalty_thirds_2)
  values ('synthetic-2027-alt', 2027, false, 0, 0);
insert into public.papers (id, exam_year, session_label, marking_policy_id, status) values
  ('00000000-0000-0000-0000-00000000e001', 2027, 'SYNTHETIC', 'gate-2027-v1', 'published');
insert into public.questions (id, paper_id, number, type, marks, body_md, validation_state, validated_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000e001', 1, 'NAT', 2, 'SYNTHETIC validated', 'validated', now()),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000e001', 2, 'MCQ', 1, 'SYNTHETIC draft', 'unvalidated', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000e001', 3, 'MSQ', 2, 'SYNTHETIC draft', 'unvalidated', null);
insert into public.question_options (question_id, option_id, body_md)
  select q, o, 'SYNTHETIC ' || o
    from unnest(array['00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c3']::uuid[]) q,
         unnest(array['A','B','C','D']) o;
insert into private.answer_keys (id, question_id, question_type, version, provenance, mcq_option, msq_options) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'NAT', 1, 'unknown', null, null),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 'MCQ', 1, 'unknown', 'B', null),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c3', 'MSQ', 1, 'unknown', null, array['A','C']);
select lives_ok($$set constraints all immediate$$, 'valid MCQ/MSQ keys pass deferred option checks');

-- ===== Policy / year =====
select throws_ok($$insert into public.papers (exam_year, session_label, marking_policy_id) values (2007, 'SYN', 'gate-2027-v1')$$,
  '23503', null, '2027 policy rejected for 2007 paper');

-- ===== Answer keys =====
-- Fixture satisfies every CHECK (MCQ with option) so only the type FK can fail.
select throws_ok($$insert into private.answer_keys (question_id, question_type, version, provenance, mcq_option)
  values ('00000000-0000-0000-0000-0000000000c1','MCQ',2,'unknown','A')$$,
  '23503', null, 'key type must match question type');
select throws_ok($$insert into private.answer_keys (question_id, question_type, version, provenance, supersedes_id)
  values ('00000000-0000-0000-0000-0000000000c1','NAT',2,'unknown','00000000-0000-0000-0000-0000000000d2')$$,
  '23503', null, 'supersedes cannot target another question''s key');
select lives_ok($$insert into private.answer_keys (question_id, question_type, version, provenance, supersedes_id)
  values ('00000000-0000-0000-0000-0000000000c1','NAT',2,'unknown','00000000-0000-0000-0000-0000000000d1')$$,
  'supersedes within same question allowed');
select throws_ok($$insert into private.answer_keys (question_id, question_type, version, provenance, msq_options)
  values ('00000000-0000-0000-0000-0000000000c3','MSQ',2,'unknown',array['A','Z'])$$,
  '23514', null, 'MSQ option outside A-H rejected');

create function pg_temp.key_then_check(q uuid, t text, v int, mcq text, msq text[]) returns void
language plpgsql as $$
begin
  insert into private.answer_keys (question_id, question_type, version, provenance, mcq_option, msq_options)
    values (q, t, v, 'unknown', mcq, msq);
  set constraints all immediate;
end $$;
select throws_ok($$select pg_temp.key_then_check('00000000-0000-0000-0000-0000000000c2','MCQ',3,'E',null)$$,
  'P0001', null, 'MCQ key option not on question rejected');
select throws_ok($$select pg_temp.key_then_check('00000000-0000-0000-0000-0000000000c3','MSQ',3,null,array['A','A'])$$,
  'P0001', null, 'MSQ duplicate option rejected');
select throws_ok($$select pg_temp.key_then_check('00000000-0000-0000-0000-0000000000c3','MSQ',4,null,array['A','E'])$$,
  'P0001', null, 'MSQ option not on question rejected');
select throws_ok($$select pg_temp.key_then_check('00000000-0000-0000-0000-0000000000c3','MSQ',5,null,array[]::text[])$$,
  '23514', null, 'empty MSQ key rejected');

-- ===== NAT ranges =====
insert into private.answer_key_nat_ranges (key_id, ordinal, min_value, max_value) values
  ('00000000-0000-0000-0000-0000000000d1', 1, -2.5, -1.5),
  ('00000000-0000-0000-0000-0000000000d1', 2, 3.1, 3.2);
select is((select count(*)::int from private.answer_key_nat_ranges where key_id = '00000000-0000-0000-0000-0000000000d1'), 2, 'gap preserved: two ranges');
select throws_ok($$insert into private.answer_key_nat_ranges (key_id, ordinal, min_value, max_value) values ('00000000-0000-0000-0000-0000000000d1', 3, 3.2, 4)$$,
  '23P01', null, 'touching NAT range rejected');
select throws_ok($$insert into private.answer_key_nat_ranges (key_id, ordinal, min_value, max_value) values ('00000000-0000-0000-0000-0000000000d1', 4, 5, 4)$$,
  '23514', null, 'inverted NAT range rejected');
select throws_ok($$insert into private.answer_key_nat_ranges (key_id, ordinal, min_value, max_value) values ('00000000-0000-0000-0000-0000000000d2', 1, 1, 2)$$,
  '23503', null, 'NAT range on MCQ key rejected');
select throws_ok($$insert into private.answer_key_nat_ranges (key_id, ordinal, min_value, max_value) values ('00000000-0000-0000-0000-0000000000d1', 5, 'NaN', 'NaN')$$,
  '23514', null, 'NaN bound rejected');
select throws_ok($$insert into private.answer_key_nat_ranges (key_id, ordinal, min_value, max_value) values ('00000000-0000-0000-0000-0000000000d1', 6, 10, 'Infinity')$$,
  '23514', null, 'Infinity bound rejected');
select throws_ok($$insert into private.answer_key_nat_ranges (key_id, ordinal, min_value, max_value) values ('00000000-0000-0000-0000-0000000000d1', 7, '-Infinity', -10)$$,
  '23514', null, '-Infinity bound rejected');

-- ===== Reset time HH:mm =====
select lives_ok($$insert into public.user_preferences (user_id) values ('00000000-0000-0000-0000-0000000000a1')$$, 'default 04:00 accepted');
select throws_ok($$update public.user_preferences set reset_time = '24:00' where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'reset 24:00 rejected');
select throws_ok($$update public.user_preferences set reset_time = '04:00:30' where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'reset with seconds rejected');
select throws_ok($$insert into public.daily_assignments (user_id, study_day, timezone, reset_time, generator_version)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-10-29', 'Asia/Kolkata', '24:00', 'synthetic')$$,
  '23514', null, 'assignment reset snapshot 24:00 rejected');

-- ===== Daily assignment =====
insert into public.daily_assignments (id, user_id, study_day, timezone, reset_time, generator_version)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '2026-10-28', 'Asia/Kolkata', '04:00', 'synthetic');
select throws_ok($$insert into public.daily_assignments (user_id, study_day, timezone, reset_time, generator_version)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-10-28', 'Asia/Kolkata', '04:00', 'synthetic')$$,
  '23505', null, 'one assignment per user per study day');

-- ===== Attempts consistency =====
select lives_ok($$insert into public.attempts (user_id, question_id, response, status, marks_thirds, key_version_id, marking_policy_id, submission_id, request_hash, context_fingerprint)
  values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', '{"kind":"NAT","value":"3.15"}', 'correct', 6,
          '00000000-0000-0000-0000-0000000000d1', 'gate-2027-v1',
          '00000000-0000-4000-8000-000000000501', repeat('1', 64), repeat('0', 32))$$, 'standalone attempt (null assignment) allowed');
select throws_ok($$insert into public.attempts (user_id, question_id, status, marks_thirds, key_version_id, marking_policy_id, submission_id, request_hash, context_fingerprint)
  values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 'unanswered', 0,
          '00000000-0000-0000-0000-0000000000d2', 'gate-2027-v1',
          '00000000-0000-4000-8000-000000000502', repeat('2', 64), repeat('0', 32))$$,
  '23503', null, 'key version of another question rejected');
select throws_ok($$insert into public.attempts (user_id, question_id, status, marks_thirds, key_version_id, marking_policy_id, submission_id, request_hash, context_fingerprint)
  values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 'unanswered', 0,
          '00000000-0000-0000-0000-0000000000d1', 'synthetic-2027-alt',
          '00000000-0000-4000-8000-000000000503', repeat('3', 64), repeat('0', 32))$$,
  '23514', null, 'policy not attached to the paper rejected');
select throws_ok($$insert into public.attempts (user_id, question_id, assignment_id, status, marks_thirds, key_version_id, marking_policy_id, submission_id, request_hash, context_fingerprint)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'unanswered', 0,
          '00000000-0000-0000-0000-0000000000d1', 'gate-2027-v1',
          '00000000-0000-4000-8000-000000000504', repeat('4', 64), repeat('0', 32))$$,
  '23503', null, 'assignment not containing the question rejected');
insert into public.daily_assignment_items (assignment_id, user_id, position, question_id)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000c1');
select throws_ok($$insert into public.attempts (user_id, question_id, assignment_id, status, marks_thirds, key_version_id, marking_policy_id, submission_id, request_hash, context_fingerprint)
  values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'unanswered', 0,
          '00000000-0000-0000-0000-0000000000d1', 'gate-2027-v1',
          '00000000-0000-4000-8000-000000000505', repeat('5', 64), repeat('0', 32))$$,
  '23503', null, 'another learner''s assignment rejected');
select lives_ok($$insert into public.attempts (user_id, question_id, assignment_id, status, marks_thirds, key_version_id, marking_policy_id, submission_id, request_hash, context_fingerprint)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'unanswered', 0,
          '00000000-0000-0000-0000-0000000000d1', 'gate-2027-v1',
          '00000000-0000-4000-8000-000000000506', repeat('6', 64), repeat('0', 32))$$, 'matching assignment attempt allowed');

-- ===== As learner A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.questions), 1, 'learner sees only validated questions');
select is((select count(*)::int from public.attempts), 1, 'learner sees only own attempts');
select throws_ok($$select * from private.answer_keys$$, '42501', null, 'learner cannot read keys');
reset role;

select * from finish();
rollback;
