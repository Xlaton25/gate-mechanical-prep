-- Source-preserving question images. Private and immutable once validated.
create table private.question_figures (
 question_id uuid not null references public.questions(id) on delete cascade,
 ordinal smallint not null check (ordinal between 1 and 10),
 source_page integer not null check (source_page > 0),
 sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
 png_base64 text not null check (length(png_base64) between 20 and 1500000 and png_base64 ~ '^[A-Za-z0-9+/=]+$'),
 primary key (question_id, ordinal)
);
alter table private.question_figures enable row level security;
revoke all on private.question_figures from public, anon, authenticated;
grant select, insert, update, delete on private.question_figures to service_role;
create function private.guard_question_figure() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare qid uuid; state text;
begin
 qid := case when TG_OP = 'DELETE' then old.question_id else new.question_id end;
 if TG_OP = 'UPDATE' and new.question_id <> old.question_id then
  raise exception 'Cannot move a source figure';
 end if;
 select validation_state into state from public.questions where id = qid for update;
 if state = 'validated' then raise exception 'Unvalidate question before changing source figures'; end if;
 if TG_OP = 'DELETE' then return old; end if;
 if encode(extensions.digest(decode(new.png_base64, 'base64'), 'sha256'), 'hex') <> new.sha256
    or substring(decode(new.png_base64, 'base64') from 1 for 8) <> decode('89504e470d0a1a0a','hex') then
  raise exception 'Invalid PNG digest or signature';
 end if;
 return new;
end $$;
revoke all on function private.guard_question_figure() from public, anon, authenticated;
create trigger question_figures_guard before insert or update or delete on private.question_figures
 for each row execute function private.guard_question_figure();
create or replace function private.practice_context(p_question_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'question_id', q.id,
    'type', q.type,
    'marks', q.marks,
    'paper_year', p.exam_year,
    'question_updated_at', q.updated_at,
    -- displayed wording: a view the learner saw must be part of the revision
    'question_body', q.body_md,
    'figure_hashes', coalesce((select jsonb_agg(jsonb_build_object('ordinal', f.ordinal, 'page', f.source_page, 'sha256', f.sha256) order by f.ordinal) from private.question_figures f where f.question_id=q.id), '[]'::jsonb),
    'option_ids', coalesce((select jsonb_agg(o.option_id order by o.option_id)
                              from public.question_options o where o.question_id = q.id), '[]'::jsonb),
    'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.option_id, 'body', o.body_md) order by o.option_id)
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
create or replace function public.practice_question_view(p_question_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', q.id,
    'number', q.number,
    'type', s.c->>'type',
    'marks', (s.c->>'marks')::int,
    'exam_year', (s.c->>'paper_year')::int,
    'session_label', p.session_label,
    'topic', t.name,
    'body_md', s.c->>'question_body',
    'options', coalesce((select jsonb_agg(jsonb_build_object('id', o->>'id', 'body_md', o->>'body') order by o->>'id')
                           from jsonb_array_elements(s.c->'options') o), '[]'::jsonb),
    'figures', coalesce((select jsonb_agg(jsonb_build_object('source_page', f.source_page, 'png_base64', f.png_base64) order by f.ordinal) from private.question_figures f where f.question_id=q.id), '[]'::jsonb),
    'revision', md5(s.c::text))
  from (select private.practice_context(p_question_id) as c) s
  join public.questions q on q.id = (s.c->>'question_id')::uuid
  join public.papers p on p.id = q.paper_id
  left join public.syllabus_topics t on t.id = q.topic_id
  where s.c is not null;
$$;
revoke all on function public.practice_question_view(uuid) from public, anon, authenticated;
grant execute on function public.practice_question_view(uuid) to service_role;
