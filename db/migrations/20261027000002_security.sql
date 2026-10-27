-- Least-privilege grants + RLS. NOT APPLIED to any remote project.

-- Private schema: nothing for anon/authenticated, explicitly.
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public, anon, authenticated;

-- Start every exposed table from zero, then grant minimally.
revoke all on public.profiles, public.user_preferences, public.syllabus_topics,
  public.marking_policies, public.papers, public.questions, public.question_options,
  public.daily_assignments, public.daily_assignment_items, public.attempts, public.revision_items
  from public, anon, authenticated;
grant all on public.profiles, public.user_preferences, public.syllabus_topics,
  public.marking_policies, public.papers, public.questions, public.question_options,
  public.daily_assignments, public.daily_assignment_items, public.attempts, public.revision_items
  to service_role;

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.syllabus_topics enable row level security;
alter table public.marking_policies enable row level security;
alter table public.papers enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.daily_assignments enable row level security;
alter table public.daily_assignment_items enable row level security;
alter table public.attempts enable row level security;
alter table public.revision_items enable row level security;

-- Profiles & preferences: own row only; only allowed columns writable.
grant select on public.profiles to authenticated;
grant insert (user_id, display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_own_select on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_own_insert on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_own_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.user_preferences to authenticated;
grant insert (user_id, daily_minutes, timezone, reset_time) on public.user_preferences to authenticated;
grant update (daily_minutes, timezone, reset_time) on public.user_preferences to authenticated;
create policy prefs_own_select on public.user_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy prefs_own_insert on public.user_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy prefs_own_update on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Reference data: read-only for signed-in learners.
grant select on public.syllabus_topics, public.marking_policies to authenticated;
create policy topics_read on public.syllabus_topics for select to authenticated using (true);
create policy policies_read on public.marking_policies for select to authenticated using (verified);

-- Content: only published papers and validated questions.
grant select on public.papers, public.questions, public.question_options to authenticated;
create policy papers_read on public.papers for select to authenticated using (status = 'published');
create policy questions_read on public.questions for select to authenticated
  using (validation_state = 'validated'
         and exists (select 1 from public.papers p where p.id = paper_id and p.status = 'published'));
-- Subquery is itself filtered by questions_read, so options follow question visibility.
create policy options_read on public.question_options for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id));

-- Progress: read own only. No insert/update/delete grants: only the server (service_role) writes,
-- so learners cannot forge scores, mastery or assignments.
grant select on public.daily_assignments, public.daily_assignment_items, public.attempts, public.revision_items to authenticated;
create policy assignments_own on public.daily_assignments for select to authenticated using (user_id = (select auth.uid()));
create policy items_own on public.daily_assignment_items for select to authenticated using (user_id = (select auth.uid()));
create policy attempts_own on public.attempts for select to authenticated using (user_id = (select auth.uid()));
create policy revision_own on public.revision_items for select to authenticated using (user_id = (select auth.uid()));

-- Marking RULES only (no exam content). Historical years get no policy until each is
-- separately verified, so their papers cannot be scored.
insert into public.marking_policies
  (id, exam_year, verified, source_url, verified_on, mcq_penalty_thirds_1, mcq_penalty_thirds_2)
values
  ('gate-2027-v1', 2027, true, 'https://gate2027.iitm.ac.in/question_paper_pattern', '2026-10-27', 1, 2);
