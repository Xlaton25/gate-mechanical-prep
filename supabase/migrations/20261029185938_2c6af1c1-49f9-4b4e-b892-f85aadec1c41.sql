DO $$
DECLARE v_ids uuid[]; v_n int;
BEGIN
  SELECT array_agg(q.id) INTO v_ids
  FROM public.questions q JOIN public.papers p ON p.id = q.paper_id
  WHERE q.validation_state = 'in_review'
    AND p.exam_year BETWEEN 2022 AND 2026
    AND NOT ((p.exam_year, p.session_label, q.number) IN ((2022,'7',10),(2022,'7',29),(2022,'8',5),(2022,'8',27),(2023,'2',55),(2024,'2',7),(2024,'2',10),(2024,'2',19),(2024,'2',34),(2024,'2',63)))
    AND EXISTS (SELECT 1 FROM private.answer_keys k WHERE k.question_id = q.id AND k.provenance_verified
                AND NOT EXISTS (SELECT 1 FROM private.answer_keys k2 WHERE k2.supersedes_id = k.id))
    AND EXISTS (SELECT 1 FROM private.question_figures f WHERE f.question_id = q.id)
    AND EXISTS (SELECT 1 FROM private.question_provenance v WHERE v.question_id = q.id);
  v_n := coalesce(array_length(v_ids, 1), 0);
  IF v_n = 0 THEN
    RAISE NOTICE 'Already released; nothing to do';
    RETURN;
  END IF;
  IF v_n <> 370 THEN
    RAISE EXCEPTION 'Candidate count % differs from expected 370; no changes made', v_n;
  END IF;
  UPDATE public.questions SET validation_state = 'validated', validated_at = now(), updated_at = now()
  WHERE id = ANY(v_ids);
  INSERT INTO private.question_validations (question_id, to_state, reviewer, note)
  SELECT unnest(v_ids), 'validated', 'owner release: Satyam Majumder',
         'Release of reviewed batch: verified official key and source artwork; app code with renderer and 2022-2025 policies synced (d7f9898).';
  UPDATE public.papers SET status = 'published'
  WHERE exam_year BETWEEN 2022 AND 2026 AND status <> 'published';
END $$;