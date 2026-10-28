-- 000009 learning MVP: daily sets, spaced revision tied to committed attempts, bookmarks,
-- daily checklist, timed mini-tests. Additive only; no content or learner rows.

-- ---------- Daily set reasons ----------
alter table public.daily_assignment_items
  add column reason text not null default 'unseen'
  check (reason in ('due_revision', 'weak_topic', 'unseen', 'least_recent'));

-- ---------- Bookmarks (learner-owned) ----------
create table public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
grant select, insert, delete on public.bookmarks to authenticated;
grant all on public.bookmarks to service_role;
alter table public.bookmarks enable row level security;
create policy bookmarks_own_select on public.bookmarks for select to authenticated using (user_id = (select auth.uid()));
create policy bookmarks_own_insert on public.bookmarks for insert to authenticated with check (user_id = (select auth.uid()));
create policy bookmarks_own_delete on public.bookmarks for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- Daily checklist (learner-owned, 3 fixed tasks) ----------
create table public.daily_checklist (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_day date not null,
  task smallint not null check (task between 1 and 3),
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, study_day, task)
);
grant select, insert, update on public.daily_checklist to authenticated;
grant all on public.daily_checklist to service_role;
alter table public.daily_checklist enable row level security;
create policy checklist_own_select on public.daily_checklist for select to authenticated using (user_id = (select auth.uid()));
create policy checklist_own_insert on public.daily_checklist for insert to authenticated with check (user_id = (select auth.uid()));
create policy checklist_own_update on public.daily_checklist for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Timed mini-tests (server-written; learner reads own) ----------
create table public.mini_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id),
  duration_sec integer not null check (duration_sec between 300 and 10800),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'finalized')),
  finalized_at timestamptz,
  result jsonb,
  unique (id, user_id),
  check (deadline_at > started_at)
);
create unique index mini_tests_one_active on public.mini_tests(user_id) where status = 'active';

create table public.mini_test_items (
  test_id uuid not null,
  user_id uuid not null,
  position smallint not null check (position between 1 and 10),
  question_id uuid not null references public.questions(id) on delete restrict,
  revision text not null check (revision ~ '^[0-9a-f]{32}$'),
  submission_id uuid not null default gen_random_uuid() unique,
  draft jsonb,
  primary key (test_id, position),
  unique (test_id, question_id),
  foreign key (test_id, user_id) references public.mini_tests(id, user_id) on delete cascade
);
grant select on public.mini_tests, public.mini_test_items to authenticated;
grant all on public.mini_tests, public.mini_test_items to service_role;
alter table public.mini_tests enable row level security;
alter table public.mini_test_items enable row level security;
create policy mini_tests_own on public.mini_tests for select to authenticated using (user_id = (select auth.uid()));
create policy mini_test_items_own on public.mini_test_items for select to authenticated using (user_id = (select auth.uid()));

grant select, insert, update on public.revision_items, public.daily_assignments, public.daily_assignment_items to service_role;

-- ---------- Spaced revision, tied to committed attempt inserts ----------
-- Fires only when an attempt row is actually inserted, so a replayed submission (no insert)
-- can never advance a step twice. Steps: 1, 3, 7, 14, 30 days.
create function private.revision_after_attempt() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  r public.revision_items%rowtype;
  nxt integer;
begin
  if new.status in ('wrong', 'unanswered') then
    insert into public.revision_items (user_id, kind, question_id, due_at, interval_days, reviews)
    values (new.user_id, 'question', new.question_id, new.submitted_at + interval '1 day', 1, 1)
    on conflict (user_id, kind, question_id) do update
      set due_at = excluded.due_at, interval_days = 1, reviews = public.revision_items.reviews + 1;
  elsif new.status = 'correct' then
    select * into r from public.revision_items
     where user_id = new.user_id and kind = 'question' and question_id = new.question_id
     for update;
    if found and r.due_at <= new.submitted_at then
      nxt := case when r.interval_days < 1 then 1 when r.interval_days < 3 then 3
                  when r.interval_days < 7 then 7 when r.interval_days < 14 then 14 else 30 end;
      update public.revision_items
         set interval_days = nxt, due_at = new.submitted_at + make_interval(days => nxt), reviews = r.reviews + 1
       where id = r.id;
    end if;
  end if;
  return null;
end $$;
create trigger attempts_revision after insert on public.attempts
  for each row execute function private.revision_after_attempt();

-- Manual "mark for revision": due now, never pushes an earlier due date later.
create function public.mark_for_revision(p_user_id uuid, p_question_id uuid) returns void
language sql volatile security invoker set search_path = '' as $$
  insert into public.revision_items (user_id, kind, question_id, due_at, interval_days, reviews)
  values (p_user_id, 'question', p_question_id, now(), 0, 0)
  on conflict (user_id, kind, question_id) do update
    set due_at = least(public.revision_items.due_at, now());
$$;

-- ---------- Eligible pool: validated, published, verified year policy, verified latest key ----------
create function public.practice_eligible_questions() returns table (question_id uuid, topic_id uuid)
language sql stable security invoker set search_path = '' as $$
  select q.id, q.topic_id
    from public.questions q
    join public.papers p on p.id = q.paper_id
    join public.marking_policies m on m.id = p.marking_policy_id and m.exam_year = p.exam_year and m.verified
   where q.validation_state = 'validated' and p.status = 'published'
     and exists (select 1 from private.answer_keys k
                  where k.question_id = q.id and k.provenance_verified
                    and k.version = (select max(k2.version) from private.answer_keys k2 where k2.question_id = q.id));
$$;

-- ---------- Daily set: at most one per user per study day; concurrent calls reuse it ----------
create function public.ensure_daily_assignment(p_user_id uuid) returns uuid
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_tz text;
  v_reset time(0);
  v_day date;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_reasons text[] := '{}';
  rec record;
begin
  select up.timezone, up.reset_time into v_tz, v_reset from public.user_preferences up where up.user_id = p_user_id;
  v_tz := coalesce(v_tz, 'Asia/Kolkata');
  v_reset := coalesce(v_reset, '04:00'::time);
  v_day := ((now() at time zone v_tz) - v_reset)::date;

  insert into public.daily_assignments (user_id, study_day, timezone, reset_time, generator_version)
  values (p_user_id, v_day, v_tz, v_reset, 'daily-v1')
  on conflict (user_id, study_day) do nothing
  returning id into v_id;
  if v_id is null then -- existing (or a concurrent call committed it first)
    select a.id into v_id from public.daily_assignments a where a.user_id = p_user_id and a.study_day = v_day;
    return v_id;
  end if;

  create temp table if not exists _elig (question_id uuid, topic_id uuid) on commit drop;
  truncate _elig;
  insert into _elig select * from public.practice_eligible_questions();

  -- 1. due revision (2)
  for rec in select e.question_id from _elig e
               join public.revision_items ri on ri.question_id = e.question_id and ri.user_id = p_user_id and ri.kind = 'question'
              where ri.due_at <= now() order by ri.due_at, e.question_id limit 2 loop
    v_ids := v_ids || rec.question_id; v_reasons := v_reasons || 'due_revision'::text;
  end loop;
  -- 2. weak topics (2): topics with < 60% accuracy on answered attempts
  for rec in select e.question_id from _elig e
               join (select q.topic_id, avg(case when a.status = 'correct' then 1.0 else 0 end) acc
                       from public.attempts a join public.questions q on q.id = a.question_id
                      where a.user_id = p_user_id and a.status in ('correct', 'wrong') and q.topic_id is not null
                      group by q.topic_id) t on t.topic_id = e.topic_id
              where t.acc < 0.6 and not (e.question_id = any(v_ids))
              order by t.acc, md5(p_user_id::text || v_day::text || e.question_id::text) limit 2 loop
    v_ids := v_ids || rec.question_id; v_reasons := v_reasons || 'weak_topic'::text;
  end loop;
  -- 3. unseen, round-robin across topics for diversity (deterministic per user/day)
  for rec in select x.question_id from (
               select e.question_id, e.topic_id,
                      row_number() over (partition by e.topic_id order by md5(p_user_id::text || v_day::text || e.question_id::text)) rn,
                      md5(p_user_id::text || v_day::text || e.question_id::text) h
                 from _elig e
                where not exists (select 1 from public.attempts a where a.user_id = p_user_id and a.question_id = e.question_id)
                  and not (e.question_id = any(v_ids))) x
              order by x.rn, x.h limit greatest(0, 10 - cardinality(v_ids)) loop
    v_ids := v_ids || rec.question_id; v_reasons := v_reasons || 'unseen'::text;
  end loop;
  -- 4. least recently attempted fills the rest
  for rec in select e.question_id from _elig e
               join (select a.question_id, max(a.submitted_at) last_at from public.attempts a
                      where a.user_id = p_user_id group by a.question_id) s on s.question_id = e.question_id
              where not (e.question_id = any(v_ids))
              order by s.last_at, e.question_id limit greatest(0, 10 - cardinality(v_ids)) loop
    v_ids := v_ids || rec.question_id; v_reasons := v_reasons || 'least_recent'::text;
  end loop;

  insert into public.daily_assignment_items (assignment_id, user_id, position, question_id, reason)
  select v_id, p_user_id, t.ord::smallint, t.qid, v_reasons[t.ord]
    from unnest(v_ids) with ordinality as t(qid, ord);
  return v_id;
end $$;

-- Background generation for configured users; same routine as the request path.
create function private.generate_due_daily() returns integer
language plpgsql volatile security invoker set search_path = '' as $$
declare n integer := 0; u uuid;
begin
  for u in select up.user_id from public.user_preferences up loop
    perform public.ensure_daily_assignment(u);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function private.revision_after_attempt() from public, anon, authenticated;
revoke all on function public.mark_for_revision(uuid, uuid) from public, anon, authenticated;
revoke all on function public.practice_eligible_questions() from public, anon, authenticated;
revoke all on function public.ensure_daily_assignment(uuid) from public, anon, authenticated;
revoke all on function private.generate_due_daily() from public, anon, authenticated;
grant execute on function private.revision_after_attempt() to service_role;
grant execute on function public.mark_for_revision(uuid, uuid) to service_role;
grant execute on function public.practice_eligible_questions() to service_role;
grant execute on function public.ensure_daily_assignment(uuid) to service_role;
grant execute on function private.generate_due_daily() to service_role;

-- Daily at 22:35 UTC (04:05 Asia/Kolkata), only where pg_cron exists. Idempotent by job name.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'gate-daily-sets';
    perform cron.schedule('gate-daily-sets', '35 22 * * *', 'select private.generate_due_daily()');
  end if;
end
$cron$;
