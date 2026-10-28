-- 000006 — view-revision binding + create-only pilot import. Source-only: no questions,
-- keys, solutions or users appear in this file; pilot content is passed as a runtime
-- parameter by a service-role caller and never stored in Git.
--
-- 1. Content-sensitive fingerprint: private.practice_context now carries the question
--    body and every option body, so a fingerprint change means the learner's displayed
--    wording or options changed — not merely the option ID list.
-- 2. public.practice_question_revision: returns ONLY that opaque fingerprint (32 hex),
--    so the detail DTO can bind what the learner viewed without exposing any key or
--    solution. Trusted server only.
-- 3. public.pilot_import: one transactional, create-only import of a validated paper
--    pilot. Exact re-run creates nothing; any existing row that differs aborts.

-- ---------- 1. content-sensitive scoring context ----------
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

-- ---------- 2. opaque revision for the detail DTO ----------
-- Hash only. A learner-facing answer-key or solution value can never come out of here.
create or replace function public.practice_question_revision(p_question_id uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select md5(c::text) from (select private.practice_context(p_question_id) as c) s where c is not null;
$$;

-- ---------- 3. create-only transactional pilot import ----------
-- Payload: {exam_year, session_label, marking_policy_id, validation_date,
--           source: {file_name, page_count, sha256, paper_url, key_url, identity},
--           questions: [{number, type, marks, body_md, source_page, topic_path: [text],
--                        options: [{option_id, body_md}],
--                        key: {provenance, provenance_verified, mcq_option | msq_options | nat_ranges:[{min,max}]},
--                        solution: {provenance, body_md}}]}
create or replace function public.pilot_import(p_payload jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_syll     text := 'gate-me-2027';
  v_year     smallint;
  v_session  text;
  v_policy   text;
  v_file     text;
  v_sha      text;
  v_pages    integer;
  v_valdate  timestamptz;
  v_qs       jsonb;
  v_q        jsonb;
  v_o        jsonb;
  v_k        jsonb;
  v_s        jsonb;
  v_opts     jsonb;
  v_optn     integer;
  v_num      smallint;
  v_type     text;
  v_marks    smallint;
  v_body     text;
  v_page     integer;
  v_msq      text[];
  v_min      text;
  v_max      text;
  v_code     text;
  v_name     text;
  v_src      uuid;
  v_job      uuid;
  v_paper    uuid;
  v_qid      uuid;
  v_key      uuid;
  v_sol      uuid;
  v_topic    uuid;
  v_prev     uuid;
  v_exist    public.questions;
  v_new_q    boolean;
  v_new_key  boolean;
  v_nums     text := '|';
  v_created  integer := 0;
  n_q  integer := 0;
  n_o  integer := 0;
  n_k  integer := 0;
  n_r  integer := 0;
  n_s  integer := 0;
  n_t  integer := 0;
  i integer;
  j integer;
  k integer;
  r integer;
begin
  -- ================= envelope =================
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'pilot_import: payload must be a JSON object' using errcode = '22023';
  end if;

  v_year    := nullif(p_payload->>'exam_year', '')::smallint;
  v_session := coalesce(p_payload->>'session_label', '');
  v_policy  := coalesce(p_payload->>'marking_policy_id', '');
  if v_year is null or v_year not between 1990 and 2100 then
    raise exception 'pilot_import: exam_year is missing or out of range' using errcode = '22023';
  end if;
  if v_session = '' or char_length(v_session) > 32 then
    raise exception 'pilot_import: session_label is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.marking_policies mp
                  where mp.id = v_policy and mp.exam_year = v_year and mp.verified) then
    raise exception 'pilot_import: no verified marking policy % for year %', v_policy, v_year using errcode = '22023';
  end if;

  v_file  := coalesce(p_payload->'source'->>'file_name', '');
  v_sha   := lower(coalesce(p_payload->'source'->>'sha256', ''));
  v_pages := nullif(p_payload->'source'->>'page_count', '')::integer;
  if v_file = '' or char_length(v_file) > 200 then
    raise exception 'pilot_import: source.file_name is required' using errcode = '22023';
  end if;
  if v_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'pilot_import: source.sha256 must be 64 hex characters' using errcode = '22023';
  end if;
  if v_pages is null or v_pages < 1 or v_pages > 100000 then
    raise exception 'pilot_import: source.page_count is required' using errcode = '22023';
  end if;
  v_valdate := coalesce(nullif(p_payload->>'validation_date', '')::date, current_date)::timestamptz;

  v_qs := p_payload->'questions';
  if jsonb_typeof(v_qs) <> 'array' or jsonb_array_length(v_qs) < 1 or jsonb_array_length(v_qs) > 200 then
    raise exception 'pilot_import: questions must be a non-empty array (max 200)' using errcode = '22023';
  end if;

  -- ================= validate every question BEFORE any write =================
  for i in 1..jsonb_array_length(v_qs) loop
    v_q    := v_qs -> (i - 1);
    v_num  := nullif(v_q->>'number', '')::smallint;
    v_type := coalesce(v_q->>'type', '');
    v_marks := nullif(v_q->>'marks', '')::smallint;
    v_body := coalesce(v_q->>'body_md', '');
    v_page := nullif(v_q->>'source_page', '')::integer;

    if v_num is null or v_num not between 1 and 200 then
      raise exception 'pilot_import: question % has no valid number', i using errcode = '22023';
    end if;
    if v_nums like '%|' || v_num::text || '|%' then
      raise exception 'pilot_import: duplicate question number % in payload', v_num using errcode = '22023';
    end if;
    v_nums := v_nums || v_num::text || '|';

    if v_type not in ('MCQ', 'MSQ', 'NAT') then
      raise exception 'pilot_import: Q% has unknown type %', v_num, v_type using errcode = '22023';
    end if;
    if v_marks not in (1, 2) then
      raise exception 'pilot_import: Q% marks must be 1 or 2', v_num using errcode = '22023';
    end if;
    if char_length(v_body) not between 1 and 20000 then
      raise exception 'pilot_import: Q% body is empty or too long', v_num using errcode = '22023';
    end if;
    if v_page is null or v_page < 1 or v_page > v_pages then
      raise exception 'pilot_import: Q% source_page is outside the paper', v_num using errcode = '22023';
    end if;

    v_opts := coalesce(v_q->'options', '[]'::jsonb);
    if jsonb_typeof(v_opts) <> 'array' then
      raise exception 'pilot_import: Q% options must be an array', v_num using errcode = '22023';
    end if;
    v_optn := jsonb_array_length(v_opts);
    if v_type = 'NAT' then
      if v_optn <> 0 then
        raise exception 'pilot_import: Q% is NAT and must carry no options', v_num using errcode = '22023';
      end if;
    else
      if v_optn not between 2 and 8 then
        raise exception 'pilot_import: Q% must have 2 to 8 options', v_num using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(v_opts) o
                  where coalesce(o->>'option_id', '') !~ '^[A-H]$'
                     or char_length(coalesce(o->>'body_md', '')) not between 1 and 5000) then
        raise exception 'pilot_import: Q% has an option with a bad id or empty body', v_num using errcode = '22023';
      end if;
      if (select count(distinct o->>'option_id') from jsonb_array_elements(v_opts) o) <> v_optn then
        raise exception 'pilot_import: Q% has repeated option ids', v_num using errcode = '22023';
      end if;
    end if;

    v_k := v_q->'key';
    if jsonb_typeof(v_k) <> 'object' then
      raise exception 'pilot_import: Q% has no answer key', v_num using errcode = '22023';
    end if;
    if coalesce(v_k->>'provenance', '') not in ('official', 'embedded_in_source', 'derived', 'unknown') then
      raise exception 'pilot_import: Q% key provenance is not allowed', v_num using errcode = '22023';
    end if;
    if coalesce((v_k->>'provenance_verified')::boolean, false) is not true then
      raise exception 'pilot_import: Q% key is not provenance-verified', v_num using errcode = '22023';
    end if;

    if v_type = 'MCQ' then
      if coalesce(v_k->>'mcq_option', '') !~ '^[A-H]$' then
        raise exception 'pilot_import: Q% needs an MCQ option letter', v_num using errcode = '22023';
      end if;
      if not exists (select 1 from jsonb_array_elements(v_opts) o where o->>'option_id' = v_k->>'mcq_option') then
        raise exception 'pilot_import: Q% key letter is not one of its options', v_num using errcode = '22023';
      end if;
    elsif v_type = 'MSQ' then
      if jsonb_typeof(v_k->'msq_options') <> 'array' or jsonb_array_length(v_k->'msq_options') < 1 then
        raise exception 'pilot_import: Q% needs a non-empty MSQ option list', v_num using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(v_k->'msq_options') x
                  where coalesce(x #>> '{}', '') !~ '^[A-H]$') then
        raise exception 'pilot_import: Q% has an MSQ option outside A-H', v_num using errcode = '22023';
      end if;
      if (select count(distinct x #>> '{}') from jsonb_array_elements(v_k->'msq_options') x)
           <> jsonb_array_length(v_k->'msq_options') then
        raise exception 'pilot_import: Q% has repeated MSQ options', v_num using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(v_k->'msq_options') x
                  where not exists (select 1 from jsonb_array_elements(v_opts) o where o->>'option_id' = x #>> '{}')) then
        raise exception 'pilot_import: Q% MSQ option is not one of its options', v_num using errcode = '22023';
      end if;
    else
      if jsonb_typeof(v_k->'nat_ranges') <> 'array' or jsonb_array_length(v_k->'nat_ranges') < 1 then
        raise exception 'pilot_import: Q% needs at least one NAT range', v_num using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(v_k->'nat_ranges') x
                  where coalesce(x->>'min', '') !~ '^-?[0-9]+(\.[0-9]+)?$'
                     or coalesce(x->>'max', '') !~ '^-?[0-9]+(\.[0-9]+)?$'
                     or char_length(coalesce(x->>'min', '')) > 27
                     or char_length(coalesce(x->>'max', '')) > 27
                     or (x->>'max')::numeric < (x->>'min')::numeric) then
        raise exception 'pilot_import: Q% has an invalid NAT range', v_num using errcode = '22023';
      end if;
    end if;

    v_s := v_q->'solution';
    if jsonb_typeof(v_s) <> 'object' or char_length(coalesce(v_s->>'body_md', '')) not between 1 and 20000 then
      raise exception 'pilot_import: Q% has no solution body', v_num using errcode = '22023';
    end if;
    if coalesce(v_s->>'provenance', '') not in ('official', 'authored', 'derived', 'unknown') then
      raise exception 'pilot_import: Q% solution provenance is not allowed', v_num using errcode = '22023';
    end if;

    if jsonb_typeof(v_q->'topic_path') <> 'array' or jsonb_array_length(v_q->'topic_path') < 1 then
      raise exception 'pilot_import: Q% has no syllabus topic path', v_num using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_q->'topic_path') t
                where char_length(trim(coalesce(t #>> '{}', ''))) not between 1 and 200) then
      raise exception 'pilot_import: Q% has a blank syllabus topic level', v_num using errcode = '22023';
    end if;
  end loop;

  -- ================= writes (create-only; any difference aborts) =================
  select id into v_src from private.source_files where file_name = v_file;
  if v_src is null then
    insert into private.source_files
      (file_name, filename_year, filename_session, page_count, sha256, status, text_layer, embeds_answer_key, notes)
    values
      (v_file, v_year,
       case when v_session ~ '^[0-9]+$' then v_session::smallint else null end,
       v_pages, v_sha, 'sampled', 'unknown', 'unknown',
       array['partial pilot: ' || jsonb_array_length(v_qs)::text || ' questions reviewed and imported; the full paper is not processed'])
    returning id into v_src;
    v_created := v_created + 1;
  else
    if exists (select 1 from private.source_files
                where id = v_src
                  and (sha256 is distinct from v_sha
                       or page_count is distinct from v_pages
                       or filename_year is distinct from v_year)) then
      raise exception 'pilot_import: source % already recorded with different metadata', v_file using errcode = '55000';
    end if;
  end if;

  insert into private.import_jobs (source_file_id, kind, status, started_at, log)
  values (v_src, 'key_import', 'running', now(),
          jsonb_build_array(jsonb_build_object('payload_md5', md5(p_payload::text),
                                               'questions', jsonb_array_length(v_qs))))
  returning id into v_job;

  select id into v_paper from public.papers where exam_year = v_year and session_label = v_session;
  if v_paper is null then
    insert into public.papers (exam_year, session_label, marking_policy_id, status, deduplicated)
    values (v_year, v_session, v_policy, 'published', false)
    returning id into v_paper;
    v_created := v_created + 1;
  else
    if exists (select 1 from public.papers
                where id = v_paper
                  and (marking_policy_id is distinct from v_policy
                       or status is distinct from 'published'
                       or deduplicated is distinct from false)) then
      raise exception 'pilot_import: paper %/% already exists with different metadata', v_year, v_session using errcode = '55000';
    end if;
  end if;

  if exists (select 1 from private.paper_sources
              where paper_id = v_paper and source_file_id = v_src and booklet_code = '' and set_code = ''
                and (page_from is distinct from 1 or page_to is distinct from v_pages)) then
    raise exception 'pilot_import: paper/source mapping for % differs', v_file using errcode = '55000';
  end if;
  insert into private.paper_sources (paper_id, source_file_id, booklet_code, set_code, page_from, page_to)
  values (v_paper, v_src, '', '', 1, v_pages)
  on conflict (paper_id, source_file_id, booklet_code, set_code) do nothing;

  for i in 1..jsonb_array_length(v_qs) loop
    v_q     := v_qs -> (i - 1);
    v_num   := (v_q->>'number')::smallint;
    v_type  := v_q->>'type';
    v_marks := (v_q->>'marks')::smallint;
    v_body  := v_q->>'body_md';
    v_page  := (v_q->>'source_page')::integer;
    v_opts  := coalesce(v_q->'options', '[]'::jsonb);
    v_optn  := jsonb_array_length(v_opts);
    v_k     := v_q->'key';
    v_s     := v_q->'solution';

    -- syllabus chain: code is the full slug path, so one level per path prefix
    v_prev := null;
    v_code := '';
    for j in 1..jsonb_array_length(v_q->'topic_path') loop
      v_name := trim(v_q->'topic_path' -> (j - 1) #>> '{}');
      v_code := v_code || case when v_code = '' then '' else '/' end
                      || lower(regexp_replace(v_name, '[^A-Za-z0-9]+', '-', 'g'));
      select id into v_topic from public.syllabus_topics
       where syllabus_version = v_syll and code = v_code;
      if v_topic is null then
        insert into public.syllabus_topics (syllabus_version, code, parent_id, name)
        values (v_syll, v_code, v_prev, v_name)
        returning id into v_topic;
        n_t := n_t + 1;
      elsif not exists (select 1 from public.syllabus_topics
                         where id = v_topic and name = v_name
                           and parent_id is not distinct from v_prev) then
        raise exception 'pilot_import: syllabus topic %/% exists with different shape', v_syll, v_code using errcode = '55000';
      end if;
      v_prev := v_topic;
    end loop;

    select * into v_exist from public.questions where paper_id = v_paper and number = v_num;
    v_new_q := not found;
    if v_new_q then
      insert into public.questions (paper_id, number, type, marks, topic_id, body_md, validation_state, validated_at)
      values (v_paper, v_num, v_type, v_marks, v_prev, v_body, 'validated', v_valdate)
      returning id into v_qid;
      n_q := n_q + 1;
      v_created := v_created + 1;
    else
      if exists (select 1 from public.questions
                  where id = v_exist.id
                    and (type is distinct from v_type
                         or marks is distinct from v_marks
                         or body_md is distinct from v_body
                         or topic_id is distinct from v_prev
                         or validation_state is distinct from 'validated')) then
        raise exception 'pilot_import: question % already exists with different content', v_num using errcode = '55000';
      end if;
      v_qid := v_exist.id;
    end if;

    -- options: exact set, create-only
    if not v_new_q and (select count(*) from public.question_options where question_id = v_qid) <> v_optn then
      raise exception 'pilot_import: question % has a different option count', v_num using errcode = '55000';
    end if;
    for k in 1..v_optn loop
      v_o := v_opts -> (k - 1);
      if exists (select 1 from public.question_options
                  where question_id = v_qid and option_id = v_o->>'option_id'
                    and body_md is distinct from (v_o->>'body_md')) then
        raise exception 'pilot_import: option % of question % differs', v_o->>'option_id', v_num using errcode = '55000';
      end if;
      insert into public.question_options (question_id, option_id, body_md)
      values (v_qid, v_o->>'option_id', v_o->>'body_md')
      on conflict (question_id, option_id) do nothing;
      if found then n_o := n_o + 1; end if;
    end loop;

    -- official answer key, version 1
    v_msq := case when v_type = 'MSQ'
                  then (select array_agg(distinct x #>> '{}' order by x #>> '{}')
                          from jsonb_array_elements(v_k->'msq_options') x)
                  else null end;

    select id into v_key from private.answer_keys where question_id = v_qid and version = 1;
    v_new_key := v_key is null;
    if v_new_key then
      insert into private.answer_keys
        (question_id, question_type, version, provenance, provenance_verified, mcq_option, msq_options)
      values
        (v_qid, v_type, 1, v_k->>'provenance', true,
         case when v_type = 'MCQ' then v_k->>'mcq_option' else null end, v_msq)
      returning id into v_key;
      n_k := n_k + 1;
      v_created := v_created + 1;
    else
      if exists (select 1 from private.answer_keys
                  where id = v_key
                    and (question_type is distinct from v_type
                         or provenance is distinct from (v_k->>'provenance')
                         or provenance_verified is not true
                         or mcq_option is distinct from (case when v_type = 'MCQ' then v_k->>'mcq_option' else null end)
                         or msq_options is distinct from v_msq)) then
        raise exception 'pilot_import: answer key for question % differs', v_num using errcode = '55000';
      end if;
    end if;

    -- NAT bounds: exact numeric text, one row per ordinal
    if v_type = 'NAT' then
      if not v_new_key and (select count(*) from private.answer_key_nat_ranges where key_id = v_key)
           <> jsonb_array_length(v_k->'nat_ranges') then
        raise exception 'pilot_import: NAT ranges for question % differ in count', v_num using errcode = '55000';
      end if;
      for r in 1..jsonb_array_length(v_k->'nat_ranges') loop
        v_min := v_k->'nat_ranges' -> (r - 1) ->> 'min';
        v_max := v_k->'nat_ranges' -> (r - 1) ->> 'max';
        if exists (select 1 from private.answer_key_nat_ranges
                    where key_id = v_key and ordinal = r
                      and (min_value::text <> v_min or max_value::text <> v_max)) then
          raise exception 'pilot_import: NAT range % of question % differs', r, v_num using errcode = '55000';
        end if;
        if not exists (select 1 from private.answer_key_nat_ranges where key_id = v_key and ordinal = r) then
          insert into private.answer_key_nat_ranges (key_id, ordinal, min_value, max_value)
          values (v_key, r, v_min::numeric, v_max::numeric);
          n_r := n_r + 1;
        end if;
      end loop;
    end if;

    -- authored solution, reviewed, bound to this exact key version
    select id into v_sol from private.solutions where question_id = v_qid and version = 1;
    if v_sol is null then
      insert into private.solutions (question_id, version, body_md, provenance, answer_key_id, reviewed)
      values (v_qid, 1, v_s->>'body_md', v_s->>'provenance', v_key, true)
      returning id into v_sol;
      n_s := n_s + 1;
    else
      if exists (select 1 from private.solutions
                  where id = v_sol
                    and (body_md is distinct from (v_s->>'body_md')
                         or provenance is distinct from (v_s->>'provenance')
                         or answer_key_id is distinct from v_key
                         or reviewed is not true)) then
        raise exception 'pilot_import: solution for question % differs', v_num using errcode = '55000';
      end if;
    end if;

    -- provenance + review audit
    if exists (select 1 from private.question_provenance
                where question_id = v_qid and source_file_id = v_src and booklet_code = ''
                  and (source_page is distinct from v_page
                       or source_question_number is distinct from v_num)) then
      raise exception 'pilot_import: provenance for question % differs', v_num using errcode = '55000';
    end if;
    insert into private.question_provenance
      (question_id, source_file_id, booklet_code, source_question_number, source_page, import_job_id)
    values (v_qid, v_src, '', v_num, v_page, v_job)
    on conflict (question_id, source_file_id, booklet_code) do nothing;

    if n_q > 0 and not exists (select 1 from private.question_validations
                                where question_id = v_qid and to_state = 'validated') then
      insert into private.question_validations (question_id, to_state, reviewer, note)
      values (v_qid, 'validated', 'owner: Satyam Majumder',
              'pilot review ' || coalesce(p_payload->>'validation_date', current_date::text)
              || ': wording and options visually checked against the official paper; key matched the official master key; reasoning checked');
    end if;
  end loop;

  -- exact re-run created nothing: leave no audit row behind either
  if v_created = 0 and n_o + n_r + n_s + n_t = 0
     and not exists (select 1 from private.question_provenance where import_job_id = v_job) then
    delete from private.import_jobs where id = v_job;
    return jsonb_build_object(
      'outcome', 'no-op', 'paper_id', v_paper, 'source_file_id', v_src,
      'exam_year', v_year, 'session_label', v_session, 'marking_policy_id', v_policy,
      'questions', jsonb_array_length(v_qs), 'payload_md5', md5(p_payload::text));
  end if;

  update private.import_jobs
     set status = 'succeeded', finished_at = now(),
         log = log || jsonb_build_array(jsonb_build_object(
           'created', jsonb_build_object('questions', n_q, 'options', n_o, 'keys', n_k,
                                         'nat_ranges', n_r, 'solutions', n_s, 'topics', n_t)))
   where id = v_job;

  return jsonb_build_object(
    'outcome', 'imported', 'job_id', v_job, 'paper_id', v_paper, 'source_file_id', v_src,
    'exam_year', v_year, 'session_label', v_session, 'marking_policy_id', v_policy,
    'created', jsonb_build_object('questions', n_q, 'options', n_o, 'keys', n_k,
                                  'nat_ranges', n_r, 'solutions', n_s, 'topics', n_t),
    'payload_md5', md5(p_payload::text));
end $$;

-- ---------- privileges: trusted server only ----------
revoke all on function public.practice_question_revision(uuid) from public, anon, authenticated;
revoke all on function public.pilot_import(jsonb) from public, anon, authenticated;
grant execute on function public.practice_question_revision(uuid) to service_role;
grant execute on function public.pilot_import(jsonb) to service_role;
