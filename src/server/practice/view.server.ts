/**
 * Strict parser for public.practice_question_view. The SQL returns the learner-safe
 * question fields AND the revision from ONE snapshot, so they cannot diverge.
 * Only allowlisted fields are copied; anything else in the row is ignored, and a
 * malformed row yields null (no answer form) rather than a partially trusted view.
 */
import type { PracticeQuestionDetail, QuestionType } from "@/lib/practice-schema";

export type PracticeView = Omit<PracticeQuestionDetail, "sourcePage" | "sourceFile">;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const TYPES: readonly string[] = ["MCQ", "MSQ", "NAT"];

export function parsePracticeView(raw: unknown, expectedQuestionId: string): PracticeView | null {
  if (!isObj(raw)) return null;
  const { id, number, type, marks, exam_year, session_label, topic, body_md, options, revision } = raw;
  if (id !== expectedQuestionId) return null;
  if (typeof number !== "number" || !Number.isInteger(number)) return null;
  if (typeof type !== "string" || !TYPES.includes(type)) return null;
  if (typeof marks !== "number" || typeof exam_year !== "number") return null;
  if (typeof body_md !== "string" || typeof revision !== "string" || !/^[0-9a-f]{32}$/.test(revision)) return null;
  if (!Array.isArray(options)) return null;
  const opts: { id: string; bodyMd: string }[] = [];
  for (const o of options) {
    if (!isObj(o) || typeof o.id !== "string" || !/^[A-H]$/.test(o.id) || typeof o.body_md !== "string") return null;
    opts.push({ id: o.id, bodyMd: o.body_md });
  }
  return {
    id,
    number,
    type: type as QuestionType,
    marks,
    year: exam_year,
    session: typeof session_label === "string" ? session_label : "",
    topic: typeof topic === "string" ? topic : null,
    bodyMd: body_md,
    options: opts.sort((a, b) => a.id.localeCompare(b.id)),
    revision,
  };
}
