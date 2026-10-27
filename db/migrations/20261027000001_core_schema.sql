-- GATE 2027 ME — core schema. NOT APPLIED to any remote project.
-- Public schema = exposed via Data API (RLS + explicit grants, see 000002).
-- private schema = never exposed; no anon/authenticated privileges.

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- Shared updated_at trigger (invoker rights, fixed search_path, no public execute)
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

-- ===================== Learner-owned =====================
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

-- ===================== Reference / content =====================
create table public.syllabus_topics (
  id uuid primary key default gen_random_uuid(),
  syllabus_version text not null,
  code text not null,
  parent_id uuid references public.syllabus_topics(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  unique (syllabus_version, code)
);

-- Versioned marking policies; each applies to exactly one exam year.
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
  -- null = no verified policy for this year; the paper cannot be scored.
  marking_policy_id text,
  status text not null default 'draft' check (status in ('draft','in_review','published','retired')),
  deduplicated boolean not null default false,
  unique (exam_year, session_label),
  -- A paper can only reference a policy for its own year (no 2027 rules on 2007).
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

-- ===================== Private (never exposed) =====================
create table private.source_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null unique,
  filename_year smallint not null,
  filename_session smallint,
  page_count integer not null check (page_count > 0),
  sha256 text unique check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text,                 -- private bucket path only; never a public URL
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

-- Several booklets/sets may map to one canonical paper.
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

-- NAT: union of strictly disjoint inclusive intervals; gaps are never collapsed.
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

-- ===================== Progress (server-written only) =====================
create table public.daily_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_day date not null,
  timezone text not null,
  reset_time time(0) not null,
  generator_version text not null,
  generated_at timestamptz not null default now(),
  unique (user_id, study_day),       -- future scheduler retries: insert ... on conflict do nothing
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
  response jsonb,                    -- null = unanswered
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
