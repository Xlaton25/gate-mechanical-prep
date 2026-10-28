-- 000004 — secure practice submission. Applied to the owned GATE project as its OWN
-- migration (not part of combined 20261028040618). Source-only: no questions, keys or users.

-- Separately verified 2026 policy (https://gate2026.iitg.ac.in/question-paper-pattern.html,
-- rechecked 2026-10-28): MCQ -1/3 (1 mark), -2/3 (2 marks); MSQ/NAT no penalty, no partial.
insert into public.marking_policies
  (id, exam_year, verified, source_url, verified_on, mcq_penalty_thirds_1, mcq_penalty_thirds_2)
values
  ('gate-2026-v1', 2026, true, 'https://gate2026.iitg.ac.in/question-paper-pattern.html', '2026-10-28', 1, 2);

-- Idempotency: a browser-generated submission UUID is unique per learner; the request
-- hash detects the same ID reused with an altered payload.
alter table public.attempts
  add column submission_id uuid not null,
  add column request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  add column context_fingerprint text not null check (context_fingerprint ~ '^[0-9a-f]{32}$'),
  add constraint attempts_user_submission_uq unique (user_id, submission_id);

-- Everything that affects a score for one question. Null unless the question is
-- validated on a published paper. Latest key version only (no fallback to older keys).
create function private.practice_context(p_question_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'question_id', q.id,
    'type', q.type,
    'marks', q.marks,
    'paper_year', p.exam_year,
    'question_updated_at', q.updated_at,
    'option_ids', coalesce((select jsonb_agg(o.option_id order by o.option_id)
                              from public.question_options o where o.question_id = q.id), '[]'::jsonb),
    'policy', (select jsonb_build_object(
                 'id', mp.id, 'exam_year', mp.exam_year, 'verified', mp.verified,
                 'mcq_penalty_thirds_1', mp.mcq_penalty_thirds_1, 'mcq_penalty_thirds_2', mp.mcq_penalty_thirds_2,
                 'msq_negative', mp.msq_negative, 'nat_negative', mp.nat_negative, 'partial_credit', mp.partial_credit)
               from public.marking_policies mp where mp.id = p.marking_policy_id),
    'key', (select jsonb_build_object(
              'id', k.id, 'version', k.version, 'type', k.question_type, 'verified', k.provenance_verified,
              'mcq_option', k.mcq_option, 'msq_options', to_jsonb(k.msq_options),
              -- numeric -> text keeps exact bounds; never rounded through floating point
              'nat_ranges', coalesce((select jsonb_agg(jsonb_build_object('min', r.min_value::text, 'max', r.max_value::text)
                                              order by r.ordinal)
                                        from private.answer_key_nat_ranges r where r.key_id = k.id), '[]'::jsonb))
            from private.answer_keys k where k.question_id = q.id
            order by k.version desc limit 1))
  from public.questions q join public.papers p on p.id = q.paper_id
  where q.id = p_question_id and q.validation_state = 'validated' and p.status = 'published';
$$;

create function public.practice_scoring_context(p_question_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select c || jsonb_build_object('fingerprint', md5(c::text))
  from (select private.practice_context(p_question_id) as c) s where c is not null;
$$;

create function public.practice_solution(p_question_id uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select s.body_md from private.solutions s where s.question_id = p_question_id
  order by s.version desc limit 1;
$$;

-- Transactional save. Re-derives the scoring context under a share lock and refuses
-- to save if anything changed since the server scored it.
create function public.practice_record_attempt(
  p_user_id uuid, p_submission_id uuid, p_request_hash text, p_question_id uuid,
  p_assignment_id uuid, p_response jsonb, p_status text, p_marks_thirds smallint,
  p_key_version_id uuid, p_policy_id text, p_context_fingerprint text, p_duration_sec integer
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  a public.attempts;
  ctx jsonb;
begin
  select * into a from public.attempts where user_id = p_user_id and submission_id = p_submission_id;
  if found then
    if a.request_hash = p_request_hash then
      return jsonb_build_object('outcome', 'replay', 'attempt', to_jsonb(a) - 'request_hash' - 'context_fingerprint');
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if p_status not in ('correct', 'wrong', 'unanswered') then
    raise exception 'status % is not recordable', p_status using errcode = '22023';
  end if;

  perform 1 from public.questions q join public.papers p on p.id = q.paper_id
   where q.id = p_question_id for share of q, p;
  ctx := private.practice_context(p_question_id);
  if ctx is null
     or md5(ctx::text) <> p_context_fingerprint
     or ctx -> 'key' ->> 'id' is distinct from p_key_version_id::text
     or coalesce((ctx -> 'key' ->> 'verified')::boolean, false) is not true
     or ctx -> 'policy' ->> 'id' is distinct from p_policy_id
     or coalesce((ctx -> 'policy' ->> 'verified')::boolean, false) is not true then
    return jsonb_build_object('outcome', 'stale');
  end if;

  insert into public.attempts (user_id, submission_id, request_hash, context_fingerprint, question_id,
    assignment_id, response, status, marks_thirds, key_version_id, marking_policy_id, duration_sec)
  values (p_user_id, p_submission_id, p_request_hash, p_context_fingerprint, p_question_id,
    p_assignment_id, p_response, p_status, p_marks_thirds, p_key_version_id, p_policy_id, p_duration_sec)
  on conflict (user_id, submission_id) do nothing
  returning * into a;

  if not found then -- a concurrent retry won the insert
    select * into a from public.attempts where user_id = p_user_id and submission_id = p_submission_id;
    if a.request_hash = p_request_hash then
      return jsonb_build_object('outcome', 'replay', 'attempt', to_jsonb(a) - 'request_hash' - 'context_fingerprint');
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;
  return jsonb_build_object('outcome', 'created', 'attempt', to_jsonb(a) - 'request_hash' - 'context_fingerprint');
end $$;

-- Trusted server only. Learners can never call these or reach private.*.
revoke all on function private.practice_context(uuid) from public, anon, authenticated;
revoke all on function public.practice_scoring_context(uuid) from public, anon, authenticated;
revoke all on function public.practice_solution(uuid) from public, anon, authenticated;
revoke all on function public.practice_record_attempt(uuid, uuid, text, uuid, uuid, jsonb, text, smallint, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function private.practice_context(uuid) to service_role;
grant execute on function public.practice_scoring_context(uuid) to service_role;
grant execute on function public.practice_solution(uuid) to service_role;
grant execute on function public.practice_record_attempt(uuid, uuid, text, uuid, uuid, jsonb, text, smallint, uuid, text, text, integer)
  to service_role;
