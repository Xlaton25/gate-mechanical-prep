/**
 * Exact decimal parsing/comparison (no floating point). Server-only.
 * Accepted syntax is deliberately strict: optional leading "-", digits,
 * optional "." followed by at least one digit. No "+", exponent, whitespace,
 * NaN, Infinity, thousands separators, or trailing junk.
 */
export const DECIMAL_RE = /^-?\d{1,15}(\.\d{1,10})?$/;

export interface ExactDecimal {
  /** value = units / 10^scale */
  units: bigint;
  scale: number;
}

export function parseDecimal(raw: unknown): ExactDecimal | null {
  if (typeof raw !== "string" || !DECIMAL_RE.test(raw)) return null;
  const neg = raw.startsWith("-");
  const body = neg ? raw.slice(1) : raw;
  const [int, frac = ""] = body.split(".");
  const units = BigInt(int + frac) * (neg ? -1n : 1n);
  return { units, scale: frac.length };
}

export function compareDecimal(a: ExactDecimal, b: ExactDecimal): -1 | 0 | 1 {
  const s = Math.max(a.scale, b.scale);
  const av = a.units * 10n ** BigInt(s - a.scale);
  const bv = b.units * 10n ** BigInt(s - b.scale);
  return av < bv ? -1 : av > bv ? 1 : 0;
}
