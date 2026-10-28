-- Combined application of db/migrations 000001_core_schema, 000002_security, 000003_integrity_hardening (unchanged, in order).

-- ======== 000001_core_schema ========
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_minutes integer check (daily_minutes is null or daily_minutes between 1 and 1440),
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) between 1 and 64),
  reset_time time(0) not null default '04:00',
  updated_at timestamptz not null default now()
);
create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function private.touch_updated_at();

create table public.syllabus_topics (
  id uuid primary key default gen_random_uuid(),
  syllabus_version text not null,
  code text not null,
  parent_id uuid references public.syllabus_topics(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  unique (syllabus_version, code)
);

create table public.marking_policies (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  exam_year smallint not null check (exam_year between 1990 and 2100),
  verified boolean not null default false,
  source_url text,
  verified_on date,
  mcq_penalty_thirds_1 smallint not null check (mcq_penalty_thirds_1 between 0 and 3),
  mcq_penalty_thirds_2 smallint not null check (mcq_penalty_thirds_2 between 0 and 6),
  msq_negative boolean not null default false,
  nat_negative boolean not null default false,
  partial_credit boolean not null default false,
  unique (id, exam_year),
  check (not verified or (source_url is not null and verified_on is not null))
);

create table public.papers (
  id uuid primary key default gen_random_uuid(),
  exam_year smallint not null check (exam_year between 1990 and 2100),
  session_label text not null default '',
  marking_policy_id text,
  status text not null default 'draft' check (status in ('draft','in_review','published','retired')),
  deduplicated boolean not null default false,
  unique (exam_year, session_label),
  foreign key (marking_policy_id, exam_year) references public.marking_policies(id, exam_year)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete restrict,
  number smallint not null check (number between 1 and 200),
  type text not null check (type in ('MCQ','MSQ','NAT')),
  marks smallint not null check (marks in (1,2)),
  topic_id uuid references public.syllabus_topics(id),
  body_md text not null check (char_length(body_md) between 1 and 20000),
  validation_state text not null default 'unvalidated'
    check (validation_state in ('unvalidated','in_review','validated','rejected')),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, number),
  unique (id, type),
  check ((validation_state = 'validated') = (validated_at is not null))
);
create trigger questions_touch before update on public.questions
  for each row execute function private.touch_updated_at();

create table public.question_options (
  question_id uuid not null references public.questions(id) on delete cascade,
  option_id text not null check (option_id ~ '^[A-H]$'),
  body_md text not null check (char_length(body_md) between 1 and 5000),
  primary key (question_id, option_id)
);

create table private.source_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null unique,
  filename_year smallint not null,
  filename_session smallint,
  page_count integer not null check (page_count > 0),
  sha256 text unique check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text,
  status text not null check (status in ('received','sampled','needs_ocr','needs_review')),
  text_layer text not null default 'unknown' check (text_layer in ('present','absent','mixed','image_body','unknown')),
  embeds_answer_key text not null default 'unknown' check (embeds_answer_key in ('yes','no','unknown')),
  notes text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table private.import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references private.source_files(id) on delete restrict,
  kind text not null check (kind in ('ocr','extract','dedupe','key_import')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  log jsonb not null default '[]',
  check (finished_at is null or started_at is not null)
);

create table private.paper_sources (
  paper_id uuid not null references public.papers(id) on delete cascade,
  source_file_id uuid not null references private.source_files(id) on delete restrict,
  booklet_code text not null default '',
  set_code text not null default '',
  page_from integer check (page_from > 0),
  page_to integer check (page_to >= page_from),
  primary key (paper_id, source_file_id, booklet_code, set_code)
);

create table private.question_provenance (
  question_id uuid not null references public.questions(id) on delete cascade,
  source_file_id uuid not null references private.source_files(id) on delete restrict,
  booklet_code text not null default '',
  source_question_number smallint,
  source_page integer check (source_page > 0),
  import_job_id uuid references private.import_jobs(id),
  primary key (question_id, source_file_id, booklet_code)
);

create table private.question_validations (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  to_state text not null check (to_state in ('unvalidated','in_review','validated','rejected')),
  reviewer text not null,
  note text,
  created_at timestamptz not null default now()
);

create table private.answer_keys (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  question_type text not null check (question_type in ('MCQ','MSQ','NAT')),
  version integer not null check (version >= 1),
  provenance text not null check (provenance in ('official','embedded_in_source','derived','unknown')),
  provenance_verified boolean not null default false,
  mcq_option text check (mcq_option ~ '^[A-H]$'),
  msq_options text[],
  supersedes_id uuid references private.answer_keys(id),
  created_at timestamptz not null default now(),
  foreign key (question_id, question_type) references public.questions(id, type) on delete restrict,
  unique (question_id, version),
  check ((question_type = 'MCQ') = (mcq_option is not null)),
  check ((question_type = 'MSQ') = (msq_options is not null)),
  check (msq_options is null or cardinality(msq_options) between 1 and 8)
);

create table private.answer_key_nat_ranges (
  key_id uuid not null references private.answer_keys(id) on delete cascade,
  ordinal smallint not null check (ordinal >= 1),
  min_value numeric not null,
  max_value numeric not null,
  primary key (key_id, ordinal),
  check (min_value <= max_value),
  constraint nat_ranges_disjoint
    exclude using gist (key_id with =, numrange(min_value, max_value, '[]') with &&)
);

create table private.solutions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  version integer not null check (version >= 1),
  body_md text not null,
  provenance text not null check (provenance in ('official','authored','derived','unknown')),
  created_at timestamptz not null default now(),
  unique (question_id, version)
);

create table public.daily_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_day date not null,
  timezone text not null,
  reset_time time(0) not null,
  generator_version text not null,
  generated_at timestamptz not null default now(),
  unique (user_id, study_day),
  unique (id, user_id)
);

create table public.daily_assignment_items (
  assignment_id uuid not null,
  user_id uuid not null,
  position smallint not null check (position between 1 and 10),
  question_id uuid not null references public.questions(id) on delete restrict,
  primary key (assignment_id, position),
  unique (assignment_id, question_id),
  foreign key (assignment_id, user_id) references public.daily_assignments(id, user_id) on delete cascade
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  assignment_id uuid references public.daily_assignments(id) on delete set null,
  response jsonb,
  status text not null check (status in ('correct','wrong','unanswered','invalid')),
  marks_thirds smallint not null check (marks_thirds between -6 and 6),
  key_version_id uuid not null references private.answer_keys(id) on delete restrict,
  marking_policy_id text not null references public.marking_policies(id),
  submitted_at timestamptz not null default now(),
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  check (status <> 'unanswered' or (marks_thirds = 0)),
  check (status <> 'invalid' or (marks_thirds = 0))
);
create index attempts_user_time on public.attempts(user_id, submitted_at desc);

create table public.revision_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('question','mistake','formula')),
  question_id uuid not null references public.questions(id) on delete cascade,
  due_at timestamptz not null,
  interval_days integer not null default 0 check (interval_days >= 0),
  ease numeric(4,2) not null default 2.50 check (ease between 1.30 and 5.00),
  reviews integer not null default 0 check (reviews >= 0),
  unique (user_id, kind, question_id)
);
create index revision_items_due on public.revision_items(user_id, due_at);

-- ======== 000002_security ========
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public, anon, authenticated;

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

grant select on public.syllabus_topics, public.marking_policies to authenticated;
create policy topics_read on public.syllabus_topics for select to authenticated using (true);
create policy policies_read on public.marking_policies for select to authenticated using (verified);

grant select on public.papers, public.questions, public.question_options to authenticated;
create policy papers_read on public.papers for select to authenticated using (status = 'published');
create policy questions_read on public.questions for select to authenticated
  using (validation_state = 'validated'
         and exists (select 1 from public.papers p where p.id = paper_id and p.status = 'published'));
create policy options_read on public.question_options for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id));

grant select on public.daily_assignments, public.daily_assignment_items, public.attempts, public.revision_items to authenticated;
create policy assignments_own on public.daily_assignments for select to authenticated using (user_id = (select auth.uid()));
create policy items_own on public.daily_assignment_items for select to authenticated using (user_id = (select auth.uid()));
create policy attempts_own on public.attempts for select to authenticated using (user_id = (select auth.uid()));
create policy revision_own on public.revision_items for select to authenticated using (user_id = (select auth.uid()));

insert into public.marking_policies
  (id, exam_year, verified, source_url, verified_on, mcq_penalty_thirds_1, mcq_penalty_thirds_2)
values
  ('gate-2027-v1', 2027, true, 'https://gate2027.iitm.ac.in/question_paper_pattern', '2026-10-27', 1, 2);

-- ======== 000003_integrity_hardening ========
alter table private.answer_keys
  add constraint answer_keys_id_question_uq unique (id, question_id),
  add constraint answer_keys_id_type_uq unique (id, question_type);

alter table private.answer_keys drop constraint answer_keys_supersedes_id_fkey;
alter table private.answer_keys
  add constraint answer_keys_supersedes_same_question_fk
    foreign key (supersedes_id, question_id) references private.answer_keys(id, question_id),
  add constraint answer_keys_not_self_superseding check (supersedes_id is null or supersedes_id <> id),
  add constraint answer_keys_msq_option_format
    check (msq_options is null or msq_options <@ array['A','B','C','D','E','F','G','H']::text[]);

create or replace function private.check_answer_key_options() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.question_type = 'MCQ' then
    if not exists (select 1 from public.question_options o
                   where o.question_id = new.question_id and o.option_id = new.mcq_option) then
      raise exception 'MCQ key % option % is not an option of question %', new.id, new.mcq_option, new.question_id;
    end if;
  elsif new.question_type = 'MSQ' then
    if cardinality(new.msq_options) < 1
       or (select count(distinct x) from unnest(new.msq_options) x) <> cardinality(new.msq_options) then
      raise exception 'MSQ key % options must be non-empty and unique', new.id;
    end if;
    if exists (select 1 from unnest(new.msq_options) x
               where not exists (select 1 from public.question_options o
                                 where o.question_id = new.question_id and o.option_id = x)) then
      raise exception 'MSQ key % references an option not on question %', new.id, new.question_id;
    end if;
  end if;
  return null;
end $$;
revoke all on function private.check_answer_key_options() from public, anon, authenticated;

create constraint trigger answer_keys_options_valid
  after insert or update on private.answer_keys
  deferrable initially deferred
  for each row execute function private.check_answer_key_options();

alter table private.answer_key_nat_ranges
  add column key_type text not null default 'NAT' check (key_type = 'NAT'),
  add constraint nat_ranges_nat_key_fk
    foreign key (key_id, key_type) references private.answer_keys(id, question_type) on delete cascade,
  add constraint nat_ranges_finite check (
    min_value > '-Infinity'::numeric and min_value < 'Infinity'::numeric and
    max_value > '-Infinity'::numeric and max_value < 'Infinity'::numeric);

alter table public.attempts
  add constraint attempts_key_matches_question_fk
    foreign key (key_version_id, question_id) references private.answer_keys(id, question_id);

alter table public.attempts drop constraint attempts_assignment_id_fkey;
alter table public.attempts
  add constraint attempts_assignment_owner_fk
    foreign key (assignment_id, user_id) references public.daily_assignments(id, user_id)
    on delete set null (assignment_id),
  add constraint attempts_assignment_item_fk
    foreign key (assignment_id, question_id) references public.daily_assignment_items(assignment_id, question_id)
    on delete set null (assignment_id);

create or replace function private.check_attempt_policy() returns trigger
language plpgsql set search_path = '' as $$
declare paper_policy text;
begin
  select p.marking_policy_id into paper_policy
    from public.questions q join public.papers p on p.id = q.paper_id
   where q.id = new.question_id;
  if paper_policy is null or paper_policy <> new.marking_policy_id then
    raise exception 'attempt policy % does not match paper policy %', new.marking_policy_id, paper_policy
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.check_attempt_policy() from public, anon, authenticated;

create trigger attempts_policy_matches_paper
  before insert or update of question_id, marking_policy_id on public.attempts
  for each row execute function private.check_attempt_policy();

alter table public.user_preferences
  add constraint user_preferences_reset_hhmm
    check (extract(second from reset_time) = 0 and reset_time <= '23:59'::time);
alter table public.daily_assignments
  add constraint daily_assignments_reset_hhmm
    check (extract(second from reset_time) = 0 and reset_time <= '23:59'::time);