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
