import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  accountMatches,
  boundListSchema,
  boundSubmitSchema,
  questionIdSchema,
  type DetailResult,
  type ListResult,
  type PracticeError,
  type QuestionType,
  type SubmitResult,
} from "./practice-schema";

// Missing table/function (schema not applied) vs anything else; never leak raw errors.
const classify = (code: string | undefined): PracticeError =>
  code === "42P01" || code === "PGRST205" || code === "PGRST202" ? "setup_pending" : "unavailable";

type PaperJoin = { exam_year: number; session_label: string } | null;

/** Validated, published questions only — enforced by RLS on the learner's own session. */
export const listPracticeQuestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundListSchema.parse(d))
  .handler(async ({ data, context }): Promise<ListResult> => {
    const { supabase, userId } = context;
    if (!accountMatches(data.expectedUserId, userId)) return { ok: false, error: "account_mismatch" };
    const [qs, at] = await Promise.all([
      supabase
        .from("questions")
        .select("id, number, type, marks, papers!inner(exam_year, session_label)")
        .eq("validation_state", "validated")
        .order("paper_id")
        .order("number")
        .limit(1000),
      supabase
        .from("attempts")
        .select("id, question_id, status, marks_thirds, submitted_at")
        .eq("user_id", userId)
        .order("submitted_at", { ascending: false })
        .limit(500),
    ]);
    if (qs.error || at.error) {
      console.error("[practice] list failed:", qs.error?.code ?? at.error?.code);
      return { ok: false, error: classify(qs.error?.code ?? at.error?.code) };
    }
    return {
      ok: true,
      questions: qs.data.map((q) => {
        const p = q.papers as unknown as PaperJoin;
        return { id: q.id, number: q.number, type: q.type as QuestionType, marks: q.marks, year: p?.exam_year ?? 0, session: p?.session_label ?? "" };
      }),
      attempts: at.data
        .filter((a) => a.status !== "invalid")
        .map((a) => ({ id: a.id, questionId: a.question_id, status: a.status as "correct" | "wrong" | "unanswered", marksThirds: a.marks_thirds, submittedAt: a.submitted_at })),
    };
  });

/**
 * Public question DTO: body, options and revision from ONE snapshot (practice_question_view),
 * so the wording shown and the revision submitted can never come from different edits.
 * Eligibility (validated question, published paper) is enforced inside that view. No key, no solution.
 */
export const getPracticeQuestion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => questionIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<DetailResult> => {
    if (!accountMatches(data.expectedUserId, context.userId)) return { ok: false, error: "account_mismatch" };
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) return { ok: false, error: "setup_pending" };
    const { fetchPracticeView, fetchPracticeSource } = await import("@/server/practice/store.server");
    let view;
    try {
      view = await fetchPracticeView(data.questionId);
    } catch (e) {
      console.error("[practice] detail failed:", (e as { code?: string }).code);
      return { ok: false, error: classify((e as { code?: string }).code) };
    }
    if (!view) return { ok: false, error: "not_found" };
    // Display provenance only (page + file name); never part of what is scored.
    const src = await fetchPracticeSource(view.id).catch(() => ({ page: null, file: null }));
    return { ok: true, question: { ...view, sourcePage: src.page, sourceFile: src.file } };
  });

/** Scores on the server and saves before returning any solution. */
export const submitPracticeAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundSubmitSchema.parse(d))
  .handler(async ({ data, context }): Promise<SubmitResult> => {
    if (!accountMatches(data.expectedUserId, context.userId)) return { ok: false, error: "account_mismatch" };
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) return { ok: false, error: "server_error" };
    const { submitBound } = await import("@/server/practice/submit.server");
    const { createAdminPracticeStore } = await import("@/server/practice/store.server");
    return submitBound(createAdminPracticeStore(), context.userId, data);
  });
