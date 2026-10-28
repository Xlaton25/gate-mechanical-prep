import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  questionIdSchema,
  submitInputSchema,
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
  .handler(async ({ context }): Promise<ListResult> => {
    const { supabase, userId } = context;
    const [qs, at] = await Promise.all([
      supabase
        .from("questions")
        .select("id, number, type, marks, papers!inner(exam_year, session_label)")
        .eq("validation_state", "validated")
        .order("paper_id")
        .order("number")
        .limit(100),
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

/** Public question DTO: body and options only. No key, no solution. */
export const getPracticeQuestion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => questionIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<DetailResult> => {
    const { data: q, error } = await context.supabase
      .from("questions")
      .select("id, number, type, marks, body_md, papers!inner(exam_year, session_label), question_options(option_id, body_md)")
      .eq("id", data.questionId)
      .eq("validation_state", "validated")
      .maybeSingle();
    if (error) {
      console.error("[practice] detail failed:", error.code);
      return { ok: false, error: classify(error.code) };
    }
    if (!q) return { ok: false, error: "not_found" };
    const p = q.papers as unknown as PaperJoin;
    return {
      ok: true,
      question: {
        id: q.id, number: q.number, type: q.type as QuestionType, marks: q.marks,
        year: p?.exam_year ?? 0, session: p?.session_label ?? "", bodyMd: q.body_md,
        options: [...(q.question_options ?? [])].sort((a, b) => a.option_id.localeCompare(b.option_id)).map((o) => ({ id: o.option_id, bodyMd: o.body_md })),
      },
    };
  });

/** Scores on the server and saves before returning any solution. */
export const submitPracticeAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<SubmitResult> => {
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) return { ok: false, error: "server_error" };
    const { submitAttempt } = await import("@/server/practice/submit.server");
    const { createAdminPracticeStore } = await import("@/server/practice/store.server");
    return submitAttempt(createAdminPracticeStore(), context.userId, data);
  });
