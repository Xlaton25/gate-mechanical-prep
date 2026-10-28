/**
 * Client-safe practice contract: strict input validation and public DTOs.
 * Contains no keys, solutions or scoring logic. Strict objects reject any
 * browser-supplied score, status, policy, key or user fields.
 */
import { z } from "zod";

const optionId = z.string().regex(/^[A-H]$/);

export const responseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MCQ"), option: optionId }).strict(),
  z.object({ kind: z.literal("MSQ"), options: z.array(optionId).min(1).max(8) }).strict(),
  z.object({ kind: z.literal("NAT"), value: z.string().min(1).max(27) }).strict(),
  z.object({ kind: z.literal("blank") }).strict(),
]);
export type PracticeResponse = z.infer<typeof responseSchema>;

export const submitInputSchema = z
  .object({
    submissionId: z.string().uuid(),
    questionId: z.string().uuid(),
    assignmentId: z.string().uuid().nullable(),
    durationSec: z.number().int().min(0).max(86400).nullable(),
    response: responseSchema,
  })
  .strict();
export type SubmitInput = z.infer<typeof submitInputSchema>;

export const questionIdSchema = z.object({ questionId: z.string().uuid() }).strict();

export type QuestionType = "MCQ" | "MSQ" | "NAT";

export interface PracticeQuestionSummary {
  id: string;
  number: number;
  type: QuestionType;
  marks: number;
  year: number;
  session: string;
}

export interface PracticeQuestionDetail extends PracticeQuestionSummary {
  bodyMd: string;
  options: { id: string; bodyMd: string }[];
}

export interface AttemptSummary {
  id: string;
  questionId: string;
  status: "correct" | "wrong" | "unanswered";
  marksThirds: number;
  submittedAt: string;
}

export type PracticeError = "setup_pending" | "unavailable";
export type ListResult = { ok: true; questions: PracticeQuestionSummary[]; attempts: AttemptSummary[] } | { ok: false; error: PracticeError };
export type DetailResult = { ok: true; question: PracticeQuestionDetail } | { ok: false; error: PracticeError | "not_found" };

export type SubmitError = "not_available" | "invalid_response" | "conflict" | "stale" | "server_error";
export type SubmitResult =
  | { ok: true; outcome: "created" | "replay"; attempt: AttemptSummary; solutionMd: string | null }
  | { ok: false; error: SubmitError };
