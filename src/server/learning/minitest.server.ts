/**
 * Timed mini-test core. Pure apart from injected deps (unit-testable).
 * - Drafts are accepted only while the test is active and before the server deadline.
 * - Finalization re-sends each item's FROZEN submission (stored submission_id + viewed
 *   revision + saved draft) through the normal scorer, so a retry is a replay: no duplicate
 *   attempts and no double revision updates. Changed content -> "stale", never graded.
 */
import { responseSchema, type PracticeResponse, type SubmitInput, type SubmitResult } from "@/lib/practice-schema";
import type { MiniTestResult, MiniTestResultItem } from "@/lib/learning-schema";

export interface MiniItemRow { position: number; questionId: string; revision: string; submissionId: string; draft: unknown }
export interface MiniTestRow {
  id: string;
  status: "active" | "finalized";
  startedAt: string;
  deadlineAt: string;
  durationSec: number;
  result: unknown;
  items: MiniItemRow[];
}
export interface MiniTestDeps {
  now(): number;
  load(testId: string): Promise<MiniTestRow | null>; // already scoped to the verified user
  writeDraft(testId: string, questionId: string, draft: PracticeResponse): Promise<void>;
  /** Only flips active -> finalized; returns false if another call already finalized it. */
  writeResult(testId: string, result: MiniTestResult): Promise<boolean>;
  submit(input: SubmitInput): Promise<SubmitResult>;
}

export type DraftOutcome = "saved" | "deadline" | "closed" | "not_in_test";

export async function saveDraft(deps: MiniTestDeps, testId: string, questionId: string, draft: PracticeResponse): Promise<DraftOutcome> {
  const t = await deps.load(testId);
  if (!t || t.status !== "active") return "closed";
  if (deps.now() >= Date.parse(t.deadlineAt)) return "deadline";
  if (!t.items.some((i) => i.questionId === questionId)) return "not_in_test";
  await deps.writeDraft(testId, questionId, draft);
  return "saved";
}

const asResult = (v: unknown): MiniTestResult | null =>
  v && typeof v === "object" && Array.isArray((v as MiniTestResult).items) ? (v as MiniTestResult) : null;

export type FinalizeOutcome = { ok: true; result: MiniTestResult } | { ok: false; error: "not_found" | "retry" };

export async function finalize(deps: MiniTestDeps, testId: string): Promise<FinalizeOutcome> {
  const t = await deps.load(testId);
  if (!t) return { ok: false, error: "not_found" };
  if (t.status === "finalized") {
    const r = asResult(t.result);
    return r ? { ok: true, result: r } : { ok: false, error: "not_found" };
  }
  const items: MiniTestResultItem[] = [];
  for (const it of [...t.items].sort((a, b) => a.position - b.position)) {
    const d = responseSchema.safeParse(it.draft);
    const response: PracticeResponse = d.success ? d.data : { kind: "blank" };
    const res = await deps.submit({
      submissionId: it.submissionId, questionId: it.questionId, expectedRevision: it.revision,
      assignmentId: null, durationSec: null, response,
    });
    if (res.ok) {
      items.push({ position: it.position, questionId: it.questionId, status: res.attempt.status, marksThirds: res.attempt.marksThirds, solutionMd: res.solutionMd });
    } else if (res.error === "stale" || res.error === "not_available") {
      items.push({ position: it.position, questionId: it.questionId, status: "stale", marksThirds: 0, solutionMd: null });
    } else if (res.error === "invalid_response") {
      items.push({ position: it.position, questionId: it.questionId, status: "invalid", marksThirds: 0, solutionMd: null });
    } else {
      // Outcome unknown: do not finalize; a retry replays the same frozen submissions.
      return { ok: false, error: "retry" };
    }
  }
  const end = Math.min(deps.now(), Date.parse(t.deadlineAt));
  const count = (s: MiniTestResultItem["status"]) => items.filter((i) => i.status === s).length;
  const result: MiniTestResult = {
    items,
    correct: count("correct"), wrong: count("wrong"), blank: count("unanswered"),
    stale: count("stale"), invalid: count("invalid"),
    netThirds: items.reduce((s, i) => s + i.marksThirds, 0),
    timeSec: Math.max(0, Math.round((end - Date.parse(t.startedAt)) / 1000)),
  };
  if (!(await deps.writeResult(testId, result))) {
    const again = await deps.load(testId);
    const r = asResult(again?.result);
    if (r) return { ok: true, result: r };
  }
  return { ok: true, result };
}
