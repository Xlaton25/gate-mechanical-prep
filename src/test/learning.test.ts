import { describe, expect, it } from "vitest";
import { summarize, streakFrom, type AttemptFact } from "@/lib/progress";
import { finalize, saveDraft, type MiniTestDeps, type MiniTestRow } from "@/server/learning/minitest.server";
import type { SubmitInput, SubmitResult } from "@/lib/practice-schema";

const a = (submittedAt: string, status: AttemptFact["status"], marksThirds = 0, durationSec = 60): AttemptFact =>
  ({ questionId: "q", status, marksThirds, submittedAt, durationSec, topicId: "t" });
const topics = new Map([["t", { id: "t", name: "Synthetic", parentId: null }]]);

describe("progress from saved attempts", () => {
  it("accuracy excludes unanswered; net marks exact", () => {
    const s = summarize([a("2026-10-28T06:00:00Z", "correct", 3), a("2026-10-28T06:01:00Z", "wrong", -1), a("2026-10-28T06:02:00Z", "unanswered")], topics, new Date("2026-10-28T07:00:00Z"));
    expect(s.accuracy).toBe(0.5);
    expect(s.unanswered).toBe(1);
    expect(s.netThirds).toBe(2);
    expect(s.byTopic[0]?.limited).toBe(true);
  });
  it("streak uses the 04:00 Asia/Kolkata study day boundary", () => {
    // 22:00Z = 03:30 IST next day -> still the previous study day
    const s = summarize([a("2026-10-26T06:00:00Z", "correct"), a("2026-10-27T22:00:00Z", "correct")], topics, new Date("2026-10-28T06:00:00Z"));
    expect(s.activeDays).toBe(2);
    expect(s.streak).toBe(2); // 26th and 27th; nothing yet today (28th) keeps yesterday's streak
    expect(streakFrom(new Set(["2026-10-25"]), "2026-10-28")).toBe(0);
  });
  it("empty input invents nothing", () => {
    const s = summarize([], topics, new Date());
    expect([s.attempts, s.streak, s.accuracy, s.weakTopic]).toEqual([0, 0, null, null]);
  });
});

const QID = "00000000-0000-4000-8000-0000000000e1";
function deps(over: Partial<MiniTestRow> = {}, submit?: (i: SubmitInput) => Promise<SubmitResult>) {
  const row: MiniTestRow = {
    id: "t1", status: "active", startedAt: "2026-10-28T06:00:00Z", deadlineAt: "2026-10-28T06:10:00Z", durationSec: 600, result: null,
    items: [{ position: 1, questionId: QID, revision: "a".repeat(32), submissionId: "00000000-0000-4000-8000-0000000000f1", draft: { kind: "MCQ", option: "A" } }],
    ...over,
  };
  const calls: SubmitInput[] = [];
  let writes = 0;
  const d: MiniTestDeps & { now: () => number } = {
    now: () => Date.parse("2026-10-28T06:05:00Z"),
    load: async () => row,
    writeDraft: async () => { writes++; },
    writeResult: async (_id, r) => { if (row.status !== "active") return false; row.status = "finalized"; row.result = r; return true; },
    submit: async (i) => { calls.push(i); return submit ? submit(i) : { ok: true, outcome: calls.length > 1 ? "replay" : "created", attempt: { id: "x", questionId: QID, status: "correct", marksThirds: 3, submittedAt: "" }, solutionMd: "s" }; },
  };
  return { d, row, calls, writes: () => writes };
}

describe("mini-test", () => {
  it("rejects drafts at/after the server deadline", async () => {
    const { d, writes } = deps();
    d.now = () => Date.parse("2026-10-28T06:10:00Z");
    expect(await saveDraft(d, "t1", QID, { kind: "MCQ", option: "B" })).toBe("deadline");
    expect(writes()).toBe(0);
  });
  it("finalizes with frozen submission + viewed revision; second call returns stored result without resubmitting", async () => {
    const { d, calls } = deps();
    const r1 = await finalize(d, "t1");
    expect(r1.ok && r1.result.correct).toBe(1);
    expect(calls[0]).toMatchObject({ submissionId: "00000000-0000-4000-8000-0000000000f1", expectedRevision: "a".repeat(32), response: { kind: "MCQ", option: "A" } });
    const r2 = await finalize(d, "t1");
    expect(r2).toEqual(r1);
    expect(calls).toHaveLength(1);
  });
  it("unknown save outcome leaves the test open for a safe replay retry", async () => {
    const { d, row } = deps({}, async () => ({ ok: false, error: "server_error" }));
    expect(await finalize(d, "t1")).toEqual({ ok: false, error: "retry" });
    expect(row.status).toBe("active");
  });
  it("changed content is marked stale, never graded", async () => {
    const { d } = deps({}, async () => ({ ok: false, error: "stale" }));
    const r = await finalize(d, "t1");
    expect(r.ok && [r.result.stale, r.result.netThirds]).toEqual([1, 0]);
  });
  it("time is capped at the deadline", async () => {
    const { d } = deps();
    d.now = () => Date.parse("2026-10-28T07:00:00Z");
    const r = await finalize(d, "t1");
    expect(r.ok && r.result.timeSec).toBe(600);
  });
});
