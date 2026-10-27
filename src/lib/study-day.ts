/**
 * Deterministic study-day calculation. A study day starts at `resetTime`
 * (HH:mm) in `timeZone`; instants before the reset belong to the previous
 * local date. Returns "YYYY-MM-DD". Pure; safe on client and server.
 */
const RESET_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function studyDay(instant: Date, timeZone = "Asia/Kolkata", resetTime = "04:00"): string {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) throw new RangeError("Invalid instant");
  const m = RESET_RE.exec(resetTime);
  if (!m) throw new RangeError("resetTime must be HH:mm");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get("year"), mo = get("month"), d = get("day");
  const localMin = get("hour") * 60 + get("minute");
  const resetMin = Number(m[1]) * 60 + Number(m[2]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (localMin < resetMin) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
