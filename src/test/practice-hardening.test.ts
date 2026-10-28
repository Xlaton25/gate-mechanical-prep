// Synthetic fixtures only — no real GATE questions, keys or solutions.
import { describe, expect, it, vi } from "vitest";
import { submitAttempt, submitBound, type PracticeStore } from "@/server/practice/submit.server";
import { accountMatches, boundSubmitSchema, questionIdSchema, boundListSchema, type SubmitInput } from "@/lib/practice-schema";

const QID = "00000000-0000-4000-8000-00000000b001";
const U1 = "00000000-0000-4000-8000-0000000000a1";
const U2 = "00000000-0000-4000-8000-0000000000a2";
const input: SubmitInput = { submissionId: "00000000-0000-4000-8000-00000000e001", questionId: QID, assignmentId: null, durationSec: 5, response: { kind: "MCQ", option: "B" } };
const attempt = { id: "orig", question_id: QID, status: "correct", marks_thirds: 3, submitted_at: "2026-10-28T09:00:00Z" };
const ctx = {
  question_id: QID, type: "MCQ", marks: 1, paper_year: 2026, option_ids: ["A", "B", "C", "D"], fingerprint: "f".repeat(32),
  policy: { id: "gate-2026-v1", exam_year: 2026, verified: true, mcq_penalty_thirds_1: 1, mcq_penalty_thirds_2: 2, msq_negative: false, nat_negative: false, partial_credit: false },
  key: { id: "synthetic-key-1", version: 1, type: "MCQ", verified: true, mcq_option: "B", msq_options: null, nat_ranges: [] },
};
const store = (over: Partial<PracticeStore>): PracticeStore => ({
  lookup: vi.fn(async () => null),
  loadContext: vi.fn(async () => ctx),
  record: vi.fn(async () => ({ outcome: "created", attempt, solution_md: "Snapshot" })),
  ...over,
});

describe("replay is looked up before current content", () => {
  it("same hash returns the original attempt + its snapshot even if content is retired", async () => {
    const s = store({ lookup: vi.fn(async () => ({ outcome: "replay", attempt, solution_md: "Original snapshot" })), loadContext: vi.fn(async () => null) });
    expect(await submitAttempt(s, U1, input)).toEqual({ ok: true, outcome: "replay", attempt: { id: "orig", questionId: QID, status: "correct", marksThirds: 3, submittedAt: attempt.submitted_at }, solutionMd: "Original snapshot" });
    expect(s.loadContext).not.toHaveBeenCalled();
    expect(s.record).not.toHaveBeenCalled();
  });
  it("altered hash conflicts without consulting content", async () => {
    const s = store({ lookup: vi.fn(async () => ({ outcome: "conflict" })) });
    expect(await submitAttempt(s, U1, input)).toEqual({ ok: false, error: "conflict" });
    expect(s.loadContext).not.toHaveBeenCalled();
  });
  it("lookup is scoped to the verified user and the request hash", async () => {
    const s = store({});
    await submitAttempt(s, U1, input);
    expect(s.lookup).toHaveBeenCalledWith(U1, input.submissionId, expect.stringMatching(/^[0-9a-f]{64}$/));
  });
  it("unexpected lookup reply is a server error, never a save", async () => {
    const s = store({ lookup: vi.fn(async () => ({ outcome: "created" })) });
    expect(await submitAttempt(s, U1, input)).toEqual({ ok: false, error: "server_error" });
    expect(s.record).not.toHaveBeenCalled();
  });
});

describe("solution snapshot comes from the save transaction", () => {
  it("saved attempt with no matching reviewed solution is still a successful save", async () => {
    for (const solution_md of [null, undefined, 42, ""]) {
      const s = store({ record: vi.fn(async () => ({ outcome: "created", attempt, solution_md })) });
      expect(await submitAttempt(s, U1, input)).toMatchObject({ ok: true, outcome: "created", solutionMd: null });
    }
  });
  it("no solution on stale/conflict", async () => {
    for (const outcome of ["stale", "conflict"] as const) {
      const s = store({ record: vi.fn(async () => ({ outcome, solution_md: "leak" })) });
      expect(await submitAttempt(s, U1, input)).toEqual({ ok: false, error: outcome });
    }
  });
});

describe("account binding", () => {
  it("expected identity must equal the verified identity", () => {
    expect(accountMatches(U1, U1)).toBe(true);
    expect(accountMatches(U1, U2)).toBe(false);
    expect(accountMatches("", "")).toBe(false);
  });
  it("every call requires an expected uuid and the submission stays strict", () => {
    expect(boundListSchema.safeParse({}).success).toBe(false);
    expect(questionIdSchema.safeParse({ questionId: QID }).success).toBe(false);
    expect(questionIdSchema.safeParse({ expectedUserId: U1, questionId: QID }).success).toBe(true);
    expect(boundSubmitSchema.safeParse({ expectedUserId: U1, submission: { ...input, userId: U2 } }).success).toBe(false);
    expect(boundSubmitSchema.safeParse({ expectedUserId: "nope", submission: input }).success).toBe(false);
  });
  it("account switched DURING async token attachment: the new account's token is rejected, nothing read or written", async () => {
    // Models the browser: the call is issued for U1, the attacher awaits the session, and the
    // session changes to U2 before the token is read. The server verifies the token (U2).
    let session = U1;
    let release!: () => void;
    const tokenReady = new Promise<void>((r) => { release = r; });
    const attachThenVerify = async () => { await tokenReady; return session; };
    const s = store({});
    const call = (async () => submitBound(s, await attachThenVerify(), { expectedUserId: U1, submission: input }))();
    session = U2; // switch while the attacher is still waiting
    release();
    expect(await call).toEqual({ ok: false, error: "account_mismatch" });
    expect(s.lookup).not.toHaveBeenCalled();
    expect(s.loadContext).not.toHaveBeenCalled();
    expect(s.record).not.toHaveBeenCalled();
  });
  it("matching account proceeds and records under the verified id only", async () => {
    const s = store({});
    await submitBound(s, U1, { expectedUserId: U1, submission: input });
    expect(vi.mocked(s.record).mock.calls[0]![0].userId).toBe(U1);
  });
});
