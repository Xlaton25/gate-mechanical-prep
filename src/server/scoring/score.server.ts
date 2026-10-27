/**
 * Pure, server-only answer scoring. Never import from client code; the
 * `.server.ts` suffix and `src/server/` location are blocked from client bundles.
 * Nothing here is wired to an endpoint yet.
 */
import { compareDecimal, parseDecimal, type ExactDecimal } from "./decimal.server";
import { resolvePolicy } from "./policies.server";

export type QuestionType = "MCQ" | "MSQ" | "NAT";

export interface ScoringQuestion {
  type: QuestionType;
  marks: 1 | 2;
  paperYear: number;
  /** Valid option IDs for MCQ/MSQ, e.g. ["A","B","C","D"]. */
  optionIds?: readonly string[];
}

export interface NatRange {
  min: string;
  max: string;
}

export type AnswerKey =
  | { keyVersionId: string; type: "MCQ"; correct: string }
  | { keyVersionId: string; type: "MSQ"; correct: readonly string[] }
  | { keyVersionId: string; type: "NAT"; ranges: readonly NatRange[] };

export type ScoreStatus = "correct" | "wrong" | "unanswered" | "invalid";

export interface ScoreResult {
  status: ScoreStatus;
  /** Exact marks in thirds (e.g. -1 = -1/3). */
  marksThirds: number;
  marks: number;
  policyId: string;
  keyVersionId: string;
  reason?: string;
}

export class KeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyError";
  }
}

type Parsed =
  | { kind: "unanswered" }
  | { kind: "invalid"; reason: string }
  | { kind: "MCQ"; option: string }
  | { kind: "MSQ"; options: string[] }
  | { kind: "NAT"; value: ExactDecimal };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Runtime validation of an untrusted response payload. */
export function parseResponse(q: ScoringQuestion, raw: unknown): Parsed {
  if (raw === null || raw === undefined) return { kind: "unanswered" };
  if (!isObj(raw)) return { kind: "invalid", reason: "not_an_object" };
  if (raw["kind"] === "blank") return { kind: "unanswered" };
  if (raw["kind"] !== q.type) return { kind: "invalid", reason: "type_mismatch" };
  const ids = new Set(q.optionIds ?? []);
  if (q.type === "MCQ") {
    if (typeof raw["option"] !== "string") return { kind: "invalid", reason: "option_not_string" };
    if (!ids.has(raw["option"])) return { kind: "invalid", reason: "unknown_option" };
    return { kind: "MCQ", option: raw["option"] };
  }
  if (q.type === "MSQ") {
    const o = raw["options"];
    if (!Array.isArray(o)) return { kind: "invalid", reason: "options_not_array" };
    if (o.length === 0) return { kind: "unanswered" };
    if (!o.every((x) => typeof x === "string")) return { kind: "invalid", reason: "option_not_string" };
    if (new Set(o).size !== o.length) return { kind: "invalid", reason: "duplicate_option" };
    if (!o.every((x) => ids.has(x as string))) return { kind: "invalid", reason: "unknown_option" };
    return { kind: "MSQ", options: o as string[] };
  }
  if (raw["value"] === "") return { kind: "unanswered" };
  const v = parseDecimal(raw["value"]);
  if (!v) return { kind: "invalid", reason: "bad_numeric_syntax" };
  return { kind: "NAT", value: v };
}

/** Validates a key; NAT ranges must be a union of strictly disjoint inclusive intervals. */
export function validateKey(q: ScoringQuestion, key: AnswerKey): void {
  if (key.type !== q.type) throw new KeyError("key/question type mismatch");
  const ids = new Set(q.optionIds ?? []);
  if (key.type === "MCQ" && !ids.has(key.correct)) throw new KeyError("MCQ key not in options");
  if (key.type === "MSQ") {
    if (key.correct.length === 0) throw new KeyError("MSQ key empty");
    if (new Set(key.correct).size !== key.correct.length) throw new KeyError("MSQ key duplicate");
    if (!key.correct.every((c) => ids.has(c))) throw new KeyError("MSQ key not in options");
  }
  if (key.type === "NAT") {
    if (key.ranges.length === 0) throw new KeyError("NAT key has no ranges");
    const rs = key.ranges.map((r) => {
      const min = parseDecimal(r.min);
      const max = parseDecimal(r.max);
      if (!min || !max) throw new KeyError("NAT bound syntax");
      if (compareDecimal(min, max) > 0) throw new KeyError("NAT min > max");
      return { min, max };
    });
    rs.sort((a, b) => compareDecimal(a.min, b.min));
    for (let i = 1; i < rs.length; i++)
      if (compareDecimal(rs[i - 1]!.max, rs[i]!.min) >= 0)
        throw new KeyError("NAT ranges overlap or touch; they must be disjoint");
  }
}

function isCorrect(key: AnswerKey, r: Exclude<Parsed, { kind: "unanswered" | "invalid" }>): boolean {
  if (key.type === "MCQ" && r.kind === "MCQ") return r.option === key.correct;
  if (key.type === "MSQ" && r.kind === "MSQ")
    return r.options.length === key.correct.length && r.options.every((o) => key.correct.includes(o));
  if (key.type === "NAT" && r.kind === "NAT")
    return key.ranges.some(
      (g) =>
        compareDecimal(r.value, parseDecimal(g.min)!) >= 0 &&
        compareDecimal(r.value, parseDecimal(g.max)!) <= 0,
    );
  return false;
}

export function scoreResponse(
  q: ScoringQuestion,
  key: AnswerKey,
  rawResponse: unknown,
  policyId: string,
): ScoreResult {
  const policy = resolvePolicy(policyId, q.paperYear);
  validateKey(q, key);
  const base = { policyId: policy.id, keyVersionId: key.keyVersionId };
  const out = (status: ScoreStatus, thirds: number, reason?: string): ScoreResult => ({
    ...base,
    status,
    marksThirds: thirds,
    marks: thirds / 3,
    ...(reason ? { reason } : {}),
  });
  const r = parseResponse(q, rawResponse);
  if (r.kind === "unanswered") return out("unanswered", 0);
  if (r.kind === "invalid") return out("invalid", 0, r.reason);
  if (isCorrect(key, r)) return out("correct", q.marks * 3);
  const penalty = q.type === "MCQ" ? policy.mcqPenaltyThirds[q.marks] : 0;
  return out("wrong", penalty === 0 ? 0 : -penalty);
}
