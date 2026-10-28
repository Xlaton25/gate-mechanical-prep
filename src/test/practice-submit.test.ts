// Synthetic fixtures only — no real GATE questions, keys or solutions.
import { describe, expect, it, vi } from "vitest";
import { submitAttempt, requestHash, type PracticeStore, type RecordArgs } from "@/server/practice/submit.server";
import { submitInputSchema, type SubmitInput } from "@/lib/practice-schema";
import { scoreResponse } from "@/server/scoring/score.server";
import { PolicyError } from "@/server/scoring/policies.server";

const QID = "00000000-0000-4000-8000-00000000b001";
const SUB = "00000000-0000-4000-8000-00000000e001";
const USER = "00000000-0000-4000-8000-0000000000a1";
const policy2026 = { id: "gate-2026-v1", exam_year: 2026, verified: true, mcq_penalty_thirds_1: 1, mcq_penalty_thirds_2: 2, msq_negative: false, nat_negative: false, partial_credit: false };
const baseCtx = (over: Record<string, unknown> = {}) => ({
  question_id: QID, type: "MCQ", marks: 1, paper_year: 2026, option_ids: ["A", "B", "C", "D"], fingerprint: "f".repeat(32),
  policy: policy2026,
  key: { id: "synthetic-key-1", version: 1, type: "MCQ", verified: true, mcq_option: "B", msq_options: null, nat_ranges: [] },
  ...over,
});
const input = (response: SubmitInput["response"], over: Partial<SubmitInput> = {}): SubmitInput => ({
  submissionId: SUB, questionId: QID, assignmentId: null, durationSec: 12, response, ...over,
});

function fakeStore(ctx: unknown, recordOutcome: (a: RecordArgs) => unknown = (a) => ({
  outcome: "created",
  attempt: { id: "att-1", question_id: a.questionId, status: a.status, marks_thirds: a.marksThirds, submitted_at: "2026-10-28T10:00:00Z" },
})) {
  const calls: string[] = [];
  const store: PracticeStore & { recorded: RecordArgs[]; calls: string[] } = {
    recorded: [], calls,
    loadContext: vi.fn(async () => { calls.push("context"); return ctx; }),
    record: vi.fn(async (a: RecordArgs) => { calls.push("record"); store.recorded.push(a); return recordOutcome(a); }),
    loadSolution: vi.fn(async () => { calls.push("solution"); return "Synthetic solution"; }),
  };
  return store;
}

describe("input validation rejects spoofed fields", () => {
  it("strips nothing: unknown score/status/key/policy/user fields fail", () => {
    for (const extra of [{ marksThirds: 3 }, { status: "correct" }, { keyVersionId: "k" }, { policyId: "gate-2027-v1" }, { userId: USER }]) {
      expect(submitInputSchema.safeParse({ ...input({ kind: "MCQ", option: "B" }), ...extra }).success).toBe(false);
    }
    expect(submitInputSchema.safeParse({ ...input({ kind: "MCQ", option: "B" }), response: { kind: "MCQ", option: "B", correct: true } }).success).toBe(false);
  });
  it("bounds ids, duration and NAT length", () => {
    expect(submitInputSchema.safeParse(input({ kind: "MCQ", option: "B" }, { submissionId: "not-a-uuid" })).success).toBe(false);
    expect(submitInputSchema.safeParse(input({ kind: "MCQ", option: "B" }, { durationSec: -1 })).success).toBe(false);
    expect(submitInputSchema.safeParse(input({ kind: "NAT", value: "1".repeat(28) })).success).toBe(false);
    expect(submitInputSchema.safeParse(input({ kind: "MSQ", options: [] })).success).toBe(false);
  });
});

describe("server scoring + save", () => {
  it("derives user, status, marks, key and policy on the server", async () => {
    const s = fakeStore(baseCtx());
    const r = await submitAttempt(s, USER, input({ kind: "MCQ", option: "A" }));
    expect(r).toMatchObject({ ok: true, outcome: "created", attempt: { status: "wrong", marksThirds: -1 } });
    expect(s.recorded[0]).toMatchObject({ userId: USER, keyVersionId: "synthetic-key-1", policyId: "gate-2026-v1", status: "wrong", marksThirds: -1, contextFingerprint: "f".repeat(32) });
  });
  it("solution is loaded only after the attempt is saved", async () => {
    const s = fakeStore(baseCtx());
    const r = await submitAttempt(s, USER, input({ kind: "MCQ", option: "B" }));
    expect(s.calls).toEqual(["context", "record", "solution"]);
    expect(r).toMatchObject({ ok: true, solutionMd: "Synthetic solution", attempt: { marksThirds: 3 } });
  });
  it("invalid payloads are rejected and never persisted", async () => {
    for (const resp of [{ kind: "MCQ", option: "E" }, { kind: "MSQ", options: ["A", "A"] }, { kind: "NAT", value: "1" }] as const) {
      const s = fakeStore(baseCtx());
      expect(await submitAttempt(s, USER, input(resp as SubmitInput["response"]))).toEqual({ ok: false, error: "invalid_response" });
      expect(s.record).not.toHaveBeenCalled();
      expect(s.loadSolution).not.toHaveBeenCalled();
    }
  });
  it("blank is saved as unanswered with null response", async () => {
    const s = fakeStore(baseCtx());
    expect(await submitAttempt(s, USER, input({ kind: "blank" }))).toMatchObject({ ok: true, attempt: { status: "unanswered", marksThirds: 0 } });
    expect(s.recorded[0]!.response).toBeNull();
  });
});

describe("unavailable content, keys and policies", () => {
  const cases: [string, unknown][] = [
    ["unpublished/unvalidated (no context)", null],
    ["no key", baseCtx({ key: null })],
    ["latest key unverified (no fallback)", baseCtx({ key: { ...baseCtx().key, version: 2, verified: false } })],
    ["no policy", baseCtx({ policy: null })],
    ["unverified policy", baseCtx({ policy: { ...policy2026, verified: false } })],
    ["2027 policy on a 2026 paper", baseCtx({ policy: { ...policy2026, id: "gate-2027-v1", exam_year: 2027 } })],
    ["DB policy differs from code", baseCtx({ policy: { ...policy2026, mcq_penalty_thirds_1: 0 } })],
    ["unknown policy id", baseCtx({ policy: { ...policy2026, id: "gate-2007-v1", exam_year: 2026 } })],
    ["key type mismatch", baseCtx({ key: { ...baseCtx().key, type: "NAT" } })],
    ["key option not on question", baseCtx({ key: { ...baseCtx().key, mcq_option: "H" } })],
    ["context for another question", baseCtx({ question_id: "00000000-0000-4000-8000-00000000b999" })],
  ];
  for (const [name, ctx] of cases)
    it(name, async () => {
      const s = fakeStore(ctx);
      expect(await submitAttempt(s, USER, input({ kind: "MCQ", option: "B" }))).toEqual({ ok: false, error: "not_available" });
      expect(s.record).not.toHaveBeenCalled();
    });
});

describe("exact NAT intervals from DB text", () => {
  const natCtx = baseCtx({ type: "NAT", marks: 2, option_ids: [], key: { id: "synthetic-key-n", version: 1, type: "NAT", verified: true, mcq_option: null, msq_options: null, nat_ranges: [{ min: "-2.50", max: "-1.5" }, { min: "3.10", max: "3.20" }] } });
  it("boundaries inclusive, gap wrong, no rounding", async () => {
    for (const [v, status] of [["-2.5", "correct"], ["3.20", "correct"], ["0", "wrong"], ["3.2000001", "wrong"]] as const) {
      const r = await submitAttempt(fakeStore(natCtx), USER, input({ kind: "NAT", value: v }));
      expect(r).toMatchObject({ ok: true, attempt: { status } });
    }
  });
});

describe("idempotency and failure outcomes", () => {
  it("replay returns the stored original attempt", async () => {
    const s = fakeStore(baseCtx(), () => ({ outcome: "replay", attempt: { id: "orig", question_id: QID, status: "correct", marks_thirds: 3, submitted_at: "2026-10-28T09:00:00Z" } }));
    expect(await submitAttempt(s, USER, input({ kind: "MCQ", option: "B" }))).toMatchObject({ ok: true, outcome: "replay", attempt: { id: "orig" } });
  });
  it("conflict and stale return no solution", async () => {
    for (const outcome of ["conflict", "stale"] as const) {
      const s = fakeStore(baseCtx(), () => ({ outcome }));
      expect(await submitAttempt(s, USER, input({ kind: "MCQ", option: "B" }))).toEqual({ ok: false, error: outcome });
      expect(s.loadSolution).not.toHaveBeenCalled();
    }
  });
  it("store errors are sanitized", async () => {
    const s = fakeStore(baseCtx(), () => { throw new Error("duplicate key value violates secret detail"); });
    const r = await submitAttempt(s, USER, input({ kind: "MCQ", option: "B" }));
    expect(r).toEqual({ ok: false, error: "server_error" });
    expect(JSON.stringify(r)).not.toContain("secret");
  });
  it("request hash: same payload stable (MSQ order-insensitive), altered payload differs", async () => {
    const a = await requestHash(input({ kind: "MSQ", options: ["A", "C"] }));
    expect(await requestHash(input({ kind: "MSQ", options: ["C", "A"] }))).toBe(a);
    expect(await requestHash(input({ kind: "MSQ", options: ["A", "D"] }))).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("gate-2026-v1 policy", () => {
  const q = (marks: 1 | 2) => ({ type: "MCQ" as const, marks, paperYear: 2026, optionIds: ["A", "B", "C", "D"] });
  const k = { keyVersionId: "synthetic", type: "MCQ" as const, correct: "B" };
  it("MCQ wrong deducts 1/3 and 2/3", () => {
    expect(scoreResponse(q(1), k, { kind: "MCQ", option: "A" }, "gate-2026-v1").marksThirds).toBe(-1);
    expect(scoreResponse(q(2), k, { kind: "MCQ", option: "A" }, "gate-2026-v1").marksThirds).toBe(-2);
  });
  it("year match is enforced both ways", () => {
    expect(() => scoreResponse({ ...q(1), paperYear: 2027 }, k, null, "gate-2026-v1")).toThrow(PolicyError);
    expect(() => scoreResponse(q(1), k, null, "gate-2027-v1")).toThrow(PolicyError);
  });
});
