/**
 * Client-safe practice contract: strict input validation and public DTOs.
 * Contains no keys, solutions or scoring logic. Strict objects reject any
 * browser-supplied score, status, policy, key or user fields.
 */
import { z } from "zod";

const optionId = z.string().regex(/^[A-H]$/);
/** Opaque fingerprint of exactly what the learner was shown; server-computed, never a key. */
const revision = z.string().regex(/^[0-9a-f]{32}$/);

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
    // The revision the learner actually viewed. The server compares it with the current
    // content before scoring, so wording/option/key/policy edits cannot grade an old view.
    expectedRevision: revision,
    assignmentId: z.string().uuid().nullable(),
    durationSec: z.number().int().min(0).max(86400).nullable(),
    response: responseSchema,
  })
  .strict();
export type SubmitInput = z.infer<typeof submitInputSchema>;

/** Every practice call names the account it was issued for; the server compares it to the verified token. */
const expectedUserId = z.string().uuid();
export const boundSubmitSchema = z.object({ expectedUserId, submission: submitInputSchema }).strict();
export type BoundSubmit = z.infer<typeof boundSubmitSchema>;
export const boundListSchema = z.object({ expectedUserId }).strict();
export const questionIdSchema = z.object({ expectedUserId, questionId: z.string().uuid() }).strict();

/** Untrusted expectation vs verified identity. Never used to derive the user. */
export const accountMatches = (expected: string, verified: string) => expected.length > 0 && expected === verified;

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
  /** Opaque revision of the wording/options/key/policy shown; must come back on submit. */
  revision: string;
  /** Display provenance only: topic label and which page of which paper file. */
  topic: string | null;
  sourcePage: number | null;
  sourceFile: string | null;
}

export interface AttemptSummary {
  id: string;
  questionId: string;
  status: "correct" | "wrong" | "unanswered";
  marksThirds: number;
  submittedAt: string;
}

export type PracticeError = "setup_pending" | "unavailable" | "account_mismatch";
export type ListResult = { ok: true; questions: PracticeQuestionSummary[]; attempts: AttemptSummary[] } | { ok: false; error: PracticeError };
export type DetailResult = { ok: true; question: PracticeQuestionDetail } | { ok: false; error: PracticeError | "not_found" };

export type SubmitError = "not_available" | "invalid_response" | "conflict" | "stale" | "server_error" | "account_mismatch";
export type SubmitResult =
  | { ok: true; outcome: "created" | "replay"; attempt: AttemptSummary; solutionMd: string | null }
  | { ok: false; error: SubmitError };
