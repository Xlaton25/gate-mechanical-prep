-- 000007 — display provenance for the practice screen. Source-only: no question wording,
-- options, keys or solutions appear in this file.
--
-- Returns which page of which paper file a validated question came from, so the practice
-- screen can show where a question is from. The private bucket path (storage_path) is
-- never selected. Trusted server only: execute is revoked from anon/authenticated.
create or replace function public.practice_source(p_question_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'source_page', qp.source_page,
    'source_question_number', qp.source_question_number,
    'file_name', sf.file_name
  )
  from private.question_provenance qp
  join private.source_files sf on sf.id = qp.source_file_id
  where qp.question_id = p_question_id
  order by qp.source_page nulls last
  limit 1;
$$;

revoke all on function public.practice_source(uuid) from public, anon, authenticated;
grant execute on function public.practice_source(uuid) to service_role;
