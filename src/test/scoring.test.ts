// Synthetic fixtures only — no real GATE questions or keys.
import { describe, expect, it } from "vitest";
import { scoreResponse, validateKey, KeyError, type AnswerKey, type ScoringQuestion } from "@/server/scoring/score.server";
import { PolicyError } from "@/server/scoring/policies.server";

const P = "gate-2027-v1";
const opts = ["A", "B", "C", "D"];
const mcq = (marks: 1 | 2): ScoringQuestion => ({ type: "MCQ", marks, paperYear: 2027, optionIds: opts });
const msq: ScoringQuestion = { type: "MSQ", marks: 2, paperYear: 2027, optionIds: opts };
const nat: ScoringQuestion = { type: "NAT", marks: 2, paperYear: 2027 };
const kM: AnswerKey = { keyVersionId: "synthetic-k1", type: "MCQ", correct: "B" };
const kS: AnswerKey = { keyVersionId: "synthetic-k2", type: "MSQ", correct: ["A", "C"] };
const kN: AnswerKey = {
  keyVersionId: "synthetic-k3",
  type: "NAT",
  ranges: [{ min: "-2.50", max: "-1.5" }, { min: "3.10", max: "3.20" }],
};

describe("MCQ", () => {
  it("correct 1 and 2 mark", () => {
    expect(scoreResponse(mcq(1), kM, { kind: "MCQ", option: "B" }, P).marksThirds).toBe(3);
    expect(scoreResponse(mcq(2), kM, { kind: "MCQ", option: "B" }, P).marks).toBe(2);
  });
  it("wrong deducts 1/3 and 2/3", () => {
    const r1 = scoreResponse(mcq(1), kM, { kind: "MCQ", option: "A" }, P);
    expect([r1.status, r1.marksThirds]).toEqual(["wrong", -1]);
    expect(scoreResponse(mcq(2), kM, { kind: "MCQ", option: "D" }, P).marksThirds).toBe(-2);
  });
  it("blank is unanswered with 0, distinct from invalid", () => {
    expect(scoreResponse(mcq(1), kM, null, P)).toMatchObject({ status: "unanswered", marksThirds: 0 });
    expect(scoreResponse(mcq(1), kM, { kind: "blank" }, P).status).toBe("unanswered");
    expect(scoreResponse(mcq(1), kM, { kind: "MCQ", option: "E" }, P)).toMatchObject({ status: "invalid", marksThirds: 0 });
    expect(scoreResponse(mcq(1), kM, { kind: "MCQ", option: 1 }, P).status).toBe("invalid");
    expect(scoreResponse(mcq(1), kM, { kind: "NAT", value: "1" }, P).status).toBe("invalid");
    expect(scoreResponse(mcq(1), kM, "B", P).status).toBe("invalid");
  });
  it("records key version and policy", () => {
    expect(scoreResponse(mcq(1), kM, { kind: "MCQ", option: "B" }, P)).toMatchObject({ keyVersionId: "synthetic-k1", policyId: P });
  });
});

describe("MSQ", () => {
  const s = (options: unknown) => scoreResponse(msq, kS, { kind: "MSQ", options }, P);
  it("exact set (any order) is correct", () => {
    expect(s(["C", "A"])).toMatchObject({ status: "correct", marksThirds: 6 });
  });
  it("subset and superset are wrong with no penalty or partial credit", () => {
    expect(s(["A"])).toMatchObject({ status: "wrong", marksThirds: 0 });
    expect(s(["A", "C", "D"])).toMatchObject({ status: "wrong", marksThirds: 0 });
  });
  it("duplicates and unknown ids are invalid; empty is unanswered", () => {
    expect(s(["A", "A", "C"])).toMatchObject({ status: "invalid", reason: "duplicate_option" });
    expect(s(["A", "C", "A"]).status).toBe("invalid");
    expect(s(["A", "Z"])).toMatchObject({ status: "invalid", reason: "unknown_option" });
    expect(s("AC").status).toBe("invalid");
    expect(s([]).status).toBe("unanswered");
  });
});

describe("NAT", () => {
  const n = (value: unknown) => scoreResponse(nat, kN, { kind: "NAT", value }, P);
  it("inclusive boundaries on every range", () => {
    for (const v of ["-2.5", "-2.500", "-1.5", "-2", "3.1", "3.2", "3.15"]) expect(n(v).status).toBe("correct");
  });
  it("gap between ranges is wrong (never collapsed), no negative", () => {
    for (const v of ["0", "-1.49", "3.09", "3.2001", "-2.51", "1"]) expect(n(v)).toMatchObject({ status: "wrong", marksThirds: 0 });
  });
  it("strict syntax: NaN, Infinity, junk, exponent, whitespace are invalid", () => {
    for (const v of ["NaN", "Infinity", "-Infinity", "3.1abc", "3.1 ", " 3.1", "1e2", "+3.1", "3.", ".5", "--1", "3,1", "0x1"])
      expect(n(v).status).toBe("invalid");
    expect(n(3.1).status).toBe("invalid");
    expect(n(Number.NaN).status).toBe("invalid");
    expect(n("").status).toBe("unanswered");
  });
});

describe("keys", () => {
  it("rejects overlapping or touching NAT ranges and inverted bounds", () => {
    const bad = (ranges: { min: string; max: string }[]) => () => validateKey(nat, { keyVersionId: "x", type: "NAT", ranges });
    expect(bad([{ min: "1", max: "3" }, { min: "2", max: "4" }])).toThrow(KeyError);
    expect(bad([{ min: "1", max: "2" }, { min: "2", max: "4" }])).toThrow(KeyError);
    expect(bad([{ min: "3", max: "1" }])).toThrow(KeyError);
    expect(bad([])).toThrow(KeyError);
    expect(bad([{ min: "NaN", max: "1" }])).toThrow(KeyError);
  });
  it("rejects MSQ keys with duplicates", () => {
    expect(() => validateKey(msq, { keyVersionId: "x", type: "MSQ", correct: ["A", "A"] })).toThrow(KeyError);
  });
});

describe("policy versioning", () => {
  it("never applies 2027 rules to historical papers", () => {
    expect(() => scoreResponse({ ...mcq(1), paperYear: 2007 }, kM, { kind: "MCQ", option: "A" }, P)).toThrow(PolicyError);
  });
  it("rejects unknown policy ids", () => {
    expect(() => scoreResponse(mcq(1), kM, null, "gate-2007-v1")).toThrow(PolicyError);
    expect(() => scoreResponse(mcq(1), kM, null, "__proto__")).toThrow(PolicyError);
  });
});
