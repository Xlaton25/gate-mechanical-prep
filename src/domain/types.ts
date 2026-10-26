/**
 * Domain model for GATE 2027 ME. Each layer is separate on purpose:
 * a SourceFile is a received artifact, a Paper is a deduplicated exam session,
 * a Question belongs to a Paper, an AnswerKey is versioned and has provenance,
 * Attempts and RevisionItems belong to the learner.
 * Nothing in this file implies any record is verified.
 */

/** Intake status. "verified" is deliberately NOT a value until validation tooling exists. */
export type SourceStatus = "received" | "sampled" | "needs_ocr" | "needs_review";

export type TextLayer = "present" | "absent" | "mixed" | "image_body" | "unknown";

export interface SourceFile {
  id: string;
  fileName: string;
  /** Year parsed from the filename only — not proof of exam year. */
  filenameYear: number;
  /** Session suffix parsed from filename (e.g. ME2017_1 → 1). */
  filenameSession: number | null;
  pageCount: number;
  status: SourceStatus;
  textLayer: TextLayer;
  embedsAnswerKey: boolean | "unknown";
  notes: string[];
}

export type PaperId = string;

export interface Paper {
  id: PaperId;
  year: number;
  session: string | null;
  /** Source files that contribute to this paper (multiple booklets/sets may map to one). */
  sourceFileIds: string[];
  setCodes: string[];
  deduplicated: boolean;
}

export type QuestionType = "MCQ" | "MSQ" | "NAT";
export type ValidationState = "unvalidated" | "in_review" | "validated" | "rejected";

export interface Question {
  id: string;
  paperId: PaperId;
  number: number;
  type: QuestionType;
  marks: 1 | 2;
  subjectId: string | null;
  conceptIds: string[];
  validation: ValidationState;
  sourcePage: number | null;
}

export interface AnswerKeyVersion {
  id: string;
  questionId: string;
  version: number;
  /** Stored server-side only; never shipped to the client. */
  provenance: "official" | "embedded_in_source" | "derived" | "unknown";
  provenanceVerified: boolean;
  createdAt: string;
  supersedes: string | null;
}

export type AttemptResponse =
  | { kind: "MCQ"; option: string }
  | { kind: "MSQ"; options: string[] }
  | { kind: "NAT"; value: string };

export interface Attempt {
  id: string;
  questionId: string;
  response: AttemptResponse;
  submittedAt: string;
  /** Filled by the server against a specific key version. */
  result: { correct: boolean; keyVersionId: string } | null;
  durationSec: number | null;
}

export type RevisionKind = "question" | "mistake" | "formula";

export interface RevisionItem {
  id: string;
  kind: RevisionKind;
  refId: string;
  dueAt: string;
  intervalDays: number;
  ease: number;
  reviews: number;
}

export interface LocalStudySettings {
  dailyMinutes: number | null;
  timezone: string;
  resetTime: string; // HH:mm
}
