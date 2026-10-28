/**
 * Server-only practice submission core. Pure apart from the injected store, so it
 * is unit-testable. The browser supplies only the answer; score, status, key,
 * policy and user come from the server.
 */
import { z } from "zod";
import type { AttemptSummary, PracticeResponse, SubmitInput, SubmitResult } from "@/lib/practice-schema";
import { MARKING_POLICIES, resolvePolicy } from "@/server/scoring/policies.server";
import { scoreResponse, type AnswerKey, type ScoringQuestion } from "@/server/scoring/score.server";

export interface RecordArgs {
  userId: string;
  submissionId: string;
  requestHash: string;
  questionId: string;
  assignmentId: string | null;
  response: PracticeResponse | null;
  status: "correct" | "wrong" | "unanswered";
  marksThirds: number;
  keyVersionId: string;
  policyId: string;
  contextFingerprint: string;
  durationSec: number | null;
}

export interface PracticeStore {
  loadContext(questionId: string): Promise<unknown>;
  record(args: RecordArgs): Promise<unknown>;
  loadSolution(questionId: string): Promise<string | null>;
}

const ctxSchema = z.object({
  question_id: z.string(),
  type: z.enum(["MCQ", "MSQ", "NAT"]),
  marks: z.union([z.literal(1), z.literal(2)]),
  paper_year: z.number().int(),
  option_ids: z.array(z.string()),
  fingerprint: z.string().regex(/^[0-9a-f]{32}$/),
  policy: z
    .object({
      id: z.string(),
      exam_year: z.number().int(),
      verified: z.boolean(),
      mcq_penalty_thirds_1: z.number().int(),
      mcq_penalty_thirds_2: z.number().int(),
      msq_negative: z.boolean(),
      nat_negative: z.boolean(),
      partial_credit: z.boolean(),
    })
    .nullable(),
  key: z
    .object({
      id: z.string(),
      version: z.number().int(),
      type: z.enum(["MCQ", "MSQ", "NAT"]),
      verified: z.boolean(),
      mcq_option: z.string().nullable(),
      msq_options: z.array(z.string()).nullable(),
      // Strings only: exact numeric text from Postgres, never parsed as JS numbers.
      nat_ranges: z.array(z.object({ min: z.string(), max: z.string() })),
    })
    .nullable(),
});
type Ctx = z.infer<typeof ctxSchema>;

const attemptRow = z.object({
  id: z.string(),
  question_id: z.string(),
  status: z.enum(["correct", "wrong", "unanswered"]),
  marks_thirds: z.number().int(),
  submitted_at: z.string(),
});
const recordSchema = z.union([
  z.object({ outcome: z.enum(["created", "replay"]), attempt: attemptRow }),
  z.object({ outcome: z.enum(["conflict", "stale"]) }),
]);

/** Canonical payload; MSQ order does not change meaning, so it does not change the hash. */
export function canonicalPayload(input: SubmitInput): string {
  const r = input.response;
  const response = r.kind === "MSQ" ? { kind: "MSQ", options: [...r.options].sort() } : r;
  return JSON.stringify({ q: input.questionId, a: input.assignmentId, d: input.durationSec, r: response });
}

export async function requestHash(input: SubmitInput): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPayload(input)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toKey(ctx: Ctx): AnswerKey | null {
  const k = ctx.key;
  if (!k || !k.verified || k.type !== ctx.type) return null;
  if (k.type === "MCQ") return k.mcq_option ? { keyVersionId: k.id, type: "MCQ", correct: k.mcq_option } : null;
  if (k.type === "MSQ") return k.msq_options ? { keyVersionId: k.id, type: "MSQ", correct: k.msq_options } : null;
  return { keyVersionId: k.id, type: "NAT", ranges: k.nat_ranges };
}

/** DB policy must be verified, for the paper's own year, and identical to the code policy. */
function policyMatches(ctx: Ctx): boolean {
  const p = ctx.policy;
  if (!p || !p.verified || p.exam_year !== ctx.paper_year) return false;
  if (!Object.prototype.hasOwnProperty.call(MARKING_POLICIES, p.id)) return false;
  try {
    const code = resolvePolicy(p.id, ctx.paper_year);
    return (
      code.mcqPenaltyThirds[1] === p.mcq_penalty_thirds_1 &&
      code.mcqPenaltyThirds[2] === p.mcq_penalty_thirds_2 &&
      p.msq_negative === false && p.nat_negative === false && p.partial_credit === false
    );
  } catch {
    return false;
  }
}

const toSummary = (a: z.infer<typeof attemptRow>): AttemptSummary => ({
  id: a.id,
  questionId: a.question_id,
  status: a.status,
  marksThirds: a.marks_thirds,
  submittedAt: a.submitted_at,
});

/** userId must come from the verified session, never from the request body. */
export async function submitAttempt(store: PracticeStore, userId: string, input: SubmitInput): Promise<SubmitResult> {
  try {
    const parsedCtx = ctxSchema.safeParse(await store.loadContext(input.questionId));
    if (!parsedCtx.success || parsedCtx.data.question_id !== input.questionId) return { ok: false, error: "not_available" };
    const ctx = parsedCtx.data;
    const key = toKey(ctx);
    if (!key || !policyMatches(ctx)) return { ok: false, error: "not_available" };

    const q: ScoringQuestion = { type: ctx.type, marks: ctx.marks, paperYear: ctx.paper_year, optionIds: ctx.option_ids };
    let scored;
    try {
      scored = scoreResponse(q, key, input.response, ctx.policy!.id);
    } catch {
      return { ok: false, error: "not_available" }; // bad key/policy; never score it
    }
    if (scored.status === "invalid") return { ok: false, error: "invalid_response" }; // never persisted

    const raw = await store.record({
      userId,
      submissionId: input.submissionId,
      requestHash: await requestHash(input),
      questionId: input.questionId,
      assignmentId: input.assignmentId,
      response: input.response.kind === "blank" ? null : input.response,
      status: scored.status,
      marksThirds: scored.marksThirds,
      keyVersionId: scored.keyVersionId,
      policyId: scored.policyId,
      contextFingerprint: ctx.fingerprint,
      durationSec: input.durationSec,
    });
    const rec = recordSchema.safeParse(raw);
    if (!rec.success) return { ok: false, error: "server_error" };
    if (rec.data.outcome === "conflict" || rec.data.outcome === "stale") return { ok: false, error: rec.data.outcome };
    // Solution only after the attempt is durably saved.
    const solutionMd = await store.loadSolution(input.questionId);
    return { ok: true, outcome: rec.data.outcome, attempt: toSummary(rec.data.attempt), solutionMd };
  } catch (e) {
    console.error("[practice] submit failed:", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "server_error" };
  }
}
