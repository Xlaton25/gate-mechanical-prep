-- 000005 — practice submission hardening. Applied to the owned GATE project as its OWN
-- migration. Never edits 000004 (already applied). Source-only: no questions, keys or users.
--
-- 1. Replay-first: a retry with the same submission ID + request hash returns the original
--    saved attempt even if the question/key/policy has since changed or been retired.
-- 2. Scoring-content race closed: the record transaction takes SHARE locks on every table
--    that feeds a score, then re-derives the context. SHARE conflicts with the ROW EXCLUSIVE
--    lock any INSERT/UPDATE/DELETE takes, so content writers wait for in-flight saves (and
--    vice versa) while concurrent saves (SHARE vs SHARE) never block each other. Scope:
--    held only for the few milliseconds of one save; content imports are rare admin jobs.
-- 3. Solution snapshot: an attempt records the reviewed solution written for the exact key
--    version it was scored against. Solutions are immutable, so replay shows the same text.

-- ---------- solutions: bound to a key version, reviewed, immutable ----------
alter table private.solutions
  add column answer_key_id uuid,
  add column reviewed boolean not null default false,
  add constraint solutions_key_same_question_fk foreign key (answer_key_id, question_id)
    references private.answer_keys (id, question_id) on delete restrict,
  add constraint solutions_id_question_key_uq unique (id, question_id, answer_key_id);

create function private.solutions_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.body_md is distinct from old.body_md
     or new.question_id is distinct from old.question_id
     or new.version is distinct from old.version
     or new.answer_key_id is distinct from old.answer_key_id
     or new.provenance is distinct from old.provenance
     or (old.reviewed and not new.reviewed) then
    raise exception 'solutions are immutable; insert a new version' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function private.solutions_immutable() from public, anon, authenticated;
create trigger solutions_immutable before update on private.solutions
  for each row execute function private.solutions_immutable();

-- ---------- attempts: snapshot of the solution shown for that attempt ----------
alter table public.attempts
  add column solution_id uuid,
  add constraint attempts_solution_matches_fk foreign key (solution_id, question_id, key_version_id)
    references private.solutions (id, question_id, answer_key_id) on delete restrict;

-- ---------- result builder + replay lookup ----------
create function private.practice_result(p_attempt_id uuid, p_outcome text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'outcome', p_outcome,
    'attempt', jsonb_build_object('id', a.id, 'question_id', a.question_id, 'status', a.status,
                                  'marks_thirds', a.marks_thirds, 'submitted_at', a.submitted_at),
    'solution_md', (select s.body_md from private.solutions s where s.id = a.solution_id))
  from public.attempts a where a.id = p_attempt_id;
$$;

-- null = this learner never used this submission ID. Does not depend on current content.
create function public.practice_lookup_submission(p_user_id uuid, p_submission_id uuid, p_request_hash text)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select case when a.request_hash = p_request_hash
              then private.practice_result(a.id, 'replay')
              else jsonb_build_object('outcome', 'conflict') end
  from public.attempts a where a.user_id = p_user_id and a.submission_id = p_submission_id;
$$;

-- ---------- transactional save (same signature as 000004, new body) ----------
create or replace function public.practice_record_attempt(
  p_user_id uuid, p_submission_id uuid, p_request_hash text, p_question_id uuid,
  p_assignment_id uuid, p_response jsonb, p_status text, p_marks_thirds smallint,
  p_key_version_id uuid, p_policy_id text, p_context_fingerprint text, p_duration_sec integer
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  r jsonb;
  ctx jsonb;
  v_solution uuid;
  v_id uuid;
begin
  r := public.practice_lookup_submission(p_user_id, p_submission_id, p_request_hash);
  if r is not null then return r; end if;

  if p_status not in ('correct', 'wrong', 'unanswered') then
    raise exception 'status % is not recordable', p_status using errcode = '22023';
  end if;

  -- Fixed order; one statement. Blocks content writers until commit; saves share it.
  perform set_config('lock_timeout', '5s', true);
  lock table public.marking_policies, public.papers, public.questions, public.question_options,
             private.answer_keys, private.answer_key_nat_ranges, private.solutions
    in share mode;

  ctx := private.practice_context(p_question_id);
  if ctx is null
     or md5(ctx::text) <> p_context_fingerprint
     or ctx -> 'key' ->> 'id' is distinct from p_key_version_id::text
     or coalesce((ctx -> 'key' ->> 'verified')::boolean, false) is not true
     or ctx -> 'policy' ->> 'id' is distinct from p_policy_id
     or coalesce((ctx -> 'policy' ->> 'verified')::boolean, false) is not true then
    return jsonb_build_object('outcome', 'stale');
  end if;

  select s.id into v_solution from private.solutions s
   where s.question_id = p_question_id and s.answer_key_id = p_key_version_id and s.reviewed
   order by s.version desc limit 1;

  insert into public.attempts (user_id, submission_id, request_hash, context_fingerprint, question_id,
    assignment_id, response, status, marks_thirds, key_version_id, marking_policy_id, duration_sec, solution_id)
  values (p_user_id, p_submission_id, p_request_hash, p_context_fingerprint, p_question_id,
    p_assignment_id, p_response, p_status, p_marks_thirds, p_key_version_id, p_policy_id, p_duration_sec, v_solution)
  on conflict (user_id, submission_id) do nothing
  returning id into v_id;

  if v_id is null then -- a concurrent retry won the insert
    return coalesce(public.practice_lookup_submission(p_user_id, p_submission_id, p_request_hash),
                    jsonb_build_object('outcome', 'conflict'));
  end if;
  return private.practice_result(v_id, 'created');
end $$;

-- Newest-arbitrary solution lookup is replaced by the per-attempt snapshot.
drop function public.practice_solution(uuid);

-- Trusted server only.
revoke all on function private.practice_result(uuid, text) from public, anon, authenticated;
revoke all on function public.practice_lookup_submission(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.practice_record_attempt(uuid, uuid, text, uuid, uuid, jsonb, text, smallint, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function private.practice_result(uuid, text) to service_role;
grant execute on function public.practice_lookup_submission(uuid, uuid, text) to service_role;
grant execute on function public.practice_record_attempt(uuid, uuid, text, uuid, uuid, jsonb, text, smallint, uuid, text, text, integer)
  to service_role;
