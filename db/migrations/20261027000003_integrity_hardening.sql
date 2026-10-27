-- Integrity hardening. NOT APPLIED to any remote project. Requires Postgres 15+
-- (column-list ON DELETE SET NULL) and numeric infinity semantics (14+).

-- ---------- Supporting composite uniques ----------
alter table private.answer_keys
  add constraint answer_keys_id_question_uq unique (id, question_id),
  add constraint answer_keys_id_type_uq unique (id, question_type);

-- ---------- 3. supersedes must stay within the same question ----------
alter table private.answer_keys drop constraint answer_keys_supersedes_id_fkey;
alter table private.answer_keys
  add constraint answer_keys_supersedes_same_question_fk
    foreign key (supersedes_id, question_id) references private.answer_keys(id, question_id),
  add constraint answer_keys_not_self_superseding check (supersedes_id is null or supersedes_id <> id),
  add constraint answer_keys_msq_option_format
    check (msq_options is null or msq_options <@ array['A','B','C','D','E','F','G','H']::text[]);

-- MCQ/MSQ option membership + MSQ uniqueness, checked at commit (deferred) so an
-- importer can insert options and keys in either order within one transaction.
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

-- ---------- 2. NAT ranges: NAT keys only, finite bounds ----------
alter table private.answer_key_nat_ranges
  add column key_type text not null default 'NAT' check (key_type = 'NAT'),
  add constraint nat_ranges_nat_key_fk
    foreign key (key_id, key_type) references private.answer_keys(id, question_type) on delete cascade,
  -- NaN sorts above +Infinity in Postgres, so these bounds exclude NaN and ±Infinity.
  add constraint nat_ranges_finite check (
    min_value > '-Infinity'::numeric and min_value < 'Infinity'::numeric and
    max_value > '-Infinity'::numeric and max_value < 'Infinity'::numeric);

-- ---------- 1. attempts must be internally consistent ----------
-- key version belongs to the attempted question
alter table public.attempts
  add constraint attempts_key_matches_question_fk
    foreign key (key_version_id, question_id) references private.answer_keys(id, question_id);

-- assignment belongs to the same learner AND contains the question (null = standalone attempt)
alter table public.attempts drop constraint attempts_assignment_id_fkey;
alter table public.attempts
  add constraint attempts_assignment_owner_fk
    foreign key (assignment_id, user_id) references public.daily_assignments(id, user_id)
    on delete set null (assignment_id),
  add constraint attempts_assignment_item_fk
    foreign key (assignment_id, question_id) references public.daily_assignment_items(assignment_id, question_id)
    on delete set null (assignment_id);

-- marking policy must be the one attached to the question's paper
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

-- ---------- 5. reset times are HH:mm (no seconds, max 23:59) ----------
alter table public.user_preferences
  add constraint user_preferences_reset_hhmm
    check (extract(second from reset_time) = 0 and reset_time <= '23:59'::time);
alter table public.daily_assignments
  add constraint daily_assignments_reset_hhmm
    check (extract(second from reset_time) = 0 and reset_time <= '23:59'::time);
