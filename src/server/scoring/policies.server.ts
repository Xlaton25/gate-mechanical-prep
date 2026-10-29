/**
 * Versioned marking policies. A policy only applies to the exam years it lists;
 * historical papers must get their own explicitly verified policy — 2027 rules
 * are never applied to 2007 or any other year automatically.
 */
export interface MarkingPolicy {
  id: string;
  appliesToYears: readonly number[];
  verified: boolean;
  sourceUrl: string;
  verifiedOn: string; // ISO date
  /** MCQ wrong-answer deduction in thirds of a mark, by question marks. */
  mcqPenaltyThirds: Readonly<Record<1 | 2, number>>;
  msqNegative: false;
  natNegative: false;
  partialCredit: false;
}

export const MARKING_POLICIES: Readonly<Record<string, MarkingPolicy>> = Object.freeze({
  "gate-2021-v1": Object.freeze({
    id: "gate-2021-v1", appliesToYears: Object.freeze([2021]), verified: true,
    sourceUrl: "https://gate2027.iitm.ac.in/static/doc/download/Answer_keys2021/me_merged_2021.pdf", verifiedOn: "2026-10-29",
    mcqPenaltyThirds: Object.freeze({ 1: 1, 2: 2 }), msqNegative: false, natNegative: false, partialCredit: false,
  }),
  "gate-2022-v1": Object.freeze({
    id: "gate-2022-v1", appliesToYears: Object.freeze([2022]), verified: true,
    sourceUrl: "https://static.zollege.in/public/image/4307ba166edea5ab9bacc319f406f144.pdf", verifiedOn: "2026-10-29",
    mcqPenaltyThirds: Object.freeze({ 1: 1, 2: 2 }), msqNegative: false, natNegative: false, partialCredit: false,
  }),
  "gate-2023-v1": Object.freeze({
    id: "gate-2023-v1", appliesToYears: Object.freeze([2023]), verified: true,
    sourceUrl: "https://gate.iitk.ac.in/GATE2023/question_pattern.html", verifiedOn: "2026-10-29",
    mcqPenaltyThirds: Object.freeze({ 1: 1, 2: 2 }), msqNegative: false, natNegative: false, partialCredit: false,
  }),
  "gate-2024-v1": Object.freeze({
    id: "gate-2024-v1", appliesToYears: Object.freeze([2024]), verified: true,
    sourceUrl: "https://gate2024.iisc.ac.in/question-papers/", verifiedOn: "2026-10-29",
    mcqPenaltyThirds: Object.freeze({ 1: 1, 2: 2 }), msqNegative: false, natNegative: false, partialCredit: false,
  }),
  "gate-2025-v1": Object.freeze({
    id: "gate-2025-v1", appliesToYears: Object.freeze([2025]), verified: true,
    sourceUrl: "https://gate2025.iitr.ac.in/question-papers.html", verifiedOn: "2026-10-29",
    mcqPenaltyThirds: Object.freeze({ 1: 1, 2: 2 }), msqNegative: false, natNegative: false, partialCredit: false,
  }),
  "gate-2026-v1": Object.freeze({
    id: "gate-2026-v1",
    appliesToYears: Object.freeze([2026]),
    verified: true,
    sourceUrl: "https://gate2026.iitg.ac.in/question-paper-pattern.html",
    verifiedOn: "2026-10-28",
    mcqPenaltyThirds: Object.freeze({ 1: 1, 2: 2 }),
    msqNegative: false,
    natNegative: false,
    partialCredit: false,
  }),
  "gate-2027-v1": Object.freeze({
    id: "gate-2027-v1",
    appliesToYears: Object.freeze([2027]),
    verified: true,
    sourceUrl: "https://gate2027.iitm.ac.in/question_paper_pattern",
    verifiedOn: "2026-10-27",
    mcqPenaltyThirds: Object.freeze({ 1: 1, 2: 2 }),
    msqNegative: false,
    natNegative: false,
    partialCredit: false,
  }),
});

export class PolicyError extends Error {
  constructor(
    public code: "unknown_policy" | "unverified_policy" | "policy_not_applicable",
    message: string,
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

export function resolvePolicy(policyId: string, paperYear: number): MarkingPolicy {
  const p = Object.prototype.hasOwnProperty.call(MARKING_POLICIES, policyId)
    ? MARKING_POLICIES[policyId]
    : undefined;
  if (!p) throw new PolicyError("unknown_policy", `No marking policy "${policyId}"`);
  if (!p.verified) throw new PolicyError("unverified_policy", `Policy "${policyId}" is not verified`);
  if (!p.appliesToYears.includes(paperYear))
    throw new PolicyError("policy_not_applicable", `Policy "${policyId}" does not apply to ${paperYear}`);
  return p;
}
