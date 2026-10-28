/** Client-safe contracts for daily sets, revision, search, analytics and mini-tests. No keys. */
import { z } from "zod";
import { responseSchema, type QuestionType, type PracticeQuestionDetail } from "./practice-schema";
import type { ProgressSummary, TopicNode } from "./progress";

const expectedUserId = z.string().uuid();
const uuid = z.string().uuid();
export const boundOnly = z.object({ expectedUserId }).strict();
export const boundQuestion = z.object({ expectedUserId, questionId: uuid }).strict();
export const bookmarkInput = z.object({ expectedUserId, questionId: uuid, on: z.boolean() }).strict();
export const checklistInput = z.object({ expectedUserId, studyDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), task: z.number().int().min(1).max(3), done: z.boolean() }).strict();
export const searchInput = z.object({
  expectedUserId,
  q: z.string().max(100).default(""),
  year: z.number().int().min(1990).max(2100).nullable().default(null),
  topicId: uuid.nullable().default(null),
  type: z.enum(["MCQ", "MSQ", "NAT"]).nullable().default(null),
  marks: z.union([z.literal(1), z.literal(2)]).nullable().default(null),
  attempted: z.enum(["any", "yes", "no"]).default("any"),
  page: z.number().int().min(0).max(1000).default(0),
}).strict();
export type SearchInput = z.infer<typeof searchInput>;
export const startTestInput = z.object({ expectedUserId, topicId: uuid.nullable(), count: z.number().int().min(1).max(10), minutes: z.number().int().min(5).max(180) }).strict();
export const draftInput = z.object({ expectedUserId, testId: uuid, questionId: uuid, response: responseSchema }).strict();
export const testIdInput = z.object({ expectedUserId, testId: uuid }).strict();

export type LearnError = "account_mismatch" | "unavailable" | "setup_pending";
export type R<T> = ({ ok: true } & T) | { ok: false; error: LearnError };

export interface QuestionMeta {
  id: string; number: number; type: QuestionType; marks: number; year: number; session: string;
  topic: string | null; subject: string | null;
}
export type DailyReason = "due_revision" | "weak_topic" | "unseen" | "least_recent";
export interface DailyItem extends QuestionMeta { position: number; reason: DailyReason; done: boolean; lastStatus: "correct" | "wrong" | "unanswered" | null }
export interface TodayData {
  assignmentId: string; studyDay: string; timezone: string; resetTime: string;
  items: DailyItem[]; poolSize: number; dueCount: number;
  checklist: boolean[]; summary: ProgressSummary; dailyMinutes: number | null;
}
export interface RevisionEntry extends QuestionMeta { dueAt?: string; intervalDays?: number; lastStatus?: string; lastAt?: string }
export interface RevisionData { due: RevisionEntry[]; upcoming: RevisionEntry[]; mistakes: RevisionEntry[]; saved: RevisionEntry[] }
export interface SearchData { rows: (QuestionMeta & { attempted: boolean; snippet: string })[]; total: number; corpus: number; years: number[]; topics: TopicNode[]; page: number; pageSize: number }
export interface CorpusData { topics: TopicNode[]; counts: { topicId: string | null; year: number; marks: number; type: QuestionType }[] }

export type MiniItemStatus = "correct" | "wrong" | "unanswered" | "stale" | "invalid";
export interface MiniTestResultItem { position: number; questionId: string; status: MiniItemStatus; marksThirds: number; solutionMd: string | null }
export interface MiniTestResult { items: MiniTestResultItem[]; correct: number; wrong: number; blank: number; stale: number; invalid: number; netThirds: number; timeSec: number }
export interface MiniTestView {
  id: string; status: "active" | "finalized"; startedAt: string; deadlineAt: string; serverNow: string; durationSec: number;
  items: { position: number; question: Omit<PracticeQuestionDetail, "sourcePage" | "sourceFile"> | null; stale: boolean; draft: z.infer<typeof responseSchema> | null }[];
  result: MiniTestResult | null;
}
