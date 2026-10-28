/**
 * Pure, client-safe progress aggregation from the learner's OWN saved attempts.
 * No keys or solutions; nothing here is invented — empty input gives empty output.
 */
import { studyDay } from "./study-day";

export interface AttemptFact {
  questionId: string;
  status: "correct" | "wrong" | "unanswered";
  marksThirds: number;
  submittedAt: string;
  durationSec: number | null;
  topicId: string | null;
}
export interface TopicNode { id: string; name: string; parentId: string | null }

export interface TopicStat {
  topicId: string;
  name: string;
  subject: string;
  attempts: number;
  correct: number;
  wrong: number;
  unanswered: number;
  /** correct / (correct + wrong); null when nothing answered. Unanswered excluded. */
  accuracy: number | null;
  netThirds: number;
  timeSec: number;
  limited: boolean;
}

export interface ProgressSummary {
  attempts: number;
  correct: number;
  wrong: number;
  unanswered: number;
  accuracy: number | null;
  netThirds: number;
  minutes: number;
  minutesToday: number;
  streak: number;
  activeDays: number;
  byTopic: TopicStat[];
  weakTopic: TopicStat | null;
  recent: AttemptFact[];
}

/** Fewer answered attempts than this are labelled "limited evidence". */
export const LIMITED_EVIDENCE = 5;

export function rootOf(topics: Map<string, TopicNode>, id: string | null): TopicNode | null {
  let t = id ? topics.get(id) ?? null : null;
  for (let i = 0; t?.parentId && i < 20; i++) t = topics.get(t.parentId) ?? t;
  return t;
}

/** Consecutive study days with ≥1 saved attempt, ending today (or yesterday if nothing yet today). */
export function streakFrom(days: Set<string>, today: string): number {
  const prev = (d: string) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() - 1);
    return t.toISOString().slice(0, 10);
  };
  let d = days.has(today) ? today : prev(today);
  let n = 0;
  while (days.has(d)) { n++; d = prev(d); }
  return n;
}

export function summarize(
  attempts: AttemptFact[],
  topics: Map<string, TopicNode>,
  now: Date,
  tz = "Asia/Kolkata",
  reset = "04:00",
): ProgressSummary {
  const today = studyDay(now, tz, reset);
  const days = new Set<string>();
  const by = new Map<string, TopicStat>();
  let correct = 0, wrong = 0, unanswered = 0, net = 0, sec = 0, secToday = 0;
  for (const a of attempts) {
    const d = studyDay(new Date(a.submittedAt), tz, reset);
    days.add(d);
    if (a.status === "correct") correct++; else if (a.status === "wrong") wrong++; else unanswered++;
    net += a.marksThirds;
    sec += a.durationSec ?? 0;
    if (d === today) secToday += a.durationSec ?? 0;
    const key = a.topicId ?? "none";
    let s = by.get(key);
    if (!s) {
      const t = a.topicId ? topics.get(a.topicId) : undefined;
      s = { topicId: key, name: t?.name ?? "Untagged", subject: rootOf(topics, a.topicId)?.name ?? "Untagged",
        attempts: 0, correct: 0, wrong: 0, unanswered: 0, accuracy: null, netThirds: 0, timeSec: 0, limited: true };
      by.set(key, s);
    }
    s.attempts++;
    s[a.status === "correct" ? "correct" : a.status === "wrong" ? "wrong" : "unanswered"]++;
    s.netThirds += a.marksThirds;
    s.timeSec += a.durationSec ?? 0;
  }
  const byTopic = [...by.values()].map((s) => {
    const answered = s.correct + s.wrong;
    return { ...s, accuracy: answered ? s.correct / answered : null, limited: answered < LIMITED_EVIDENCE };
  }).sort((a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name));
  const weakTopic = byTopic
    .filter((t) => t.accuracy !== null && t.accuracy < 0.6 && t.topicId !== "none")
    .sort((a, b) => a.accuracy! - b.accuracy! || b.attempts - a.attempts)[0] ?? null;
  const answered = correct + wrong;
  return {
    attempts: attempts.length, correct, wrong, unanswered,
    accuracy: answered ? correct / answered : null,
    netThirds: net,
    minutes: Math.round(sec / 60),
    minutesToday: Math.round(secToday / 60),
    streak: streakFrom(days, today),
    activeDays: days.size,
    byTopic, weakTopic,
    recent: [...attempts].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 10),
  };
}

export const fmtThirds = (thirds: number) => {
  const sign = thirds < 0 ? "−" : thirds > 0 ? "+" : "";
  const a = Math.abs(thirds);
  const whole = Math.floor(a / 3), rem = a % 3;
  return `${sign}${rem === 0 ? whole : whole ? `${whole} ${rem}/3` : `${rem}/3`}`;
};
export const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
