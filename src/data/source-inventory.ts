import type { SourceFile, SourceStatus, TextLayer } from "@/domain/types";

/**
 * Pure fixture of the ME.zip intake (26 PDFs, 859 pages, filenames 2007–2026).
 * Metadata only — no PDFs, no question content, no answers.
 * "received" = in the archive, no specific per-file finding recorded yet.
 */
type Row = [string, number, SourceStatus, TextLayer, boolean | "unknown", string[]];

const NO_TEXT = "Sampled pages have no text layer.";

const rows: Row[] = [
  ["ME2007.pdf", 19, "needs_ocr", "absent", "unknown", [NO_TEXT]],
  ["ME2008.pdf", 21, "needs_ocr", "absent", "unknown", [NO_TEXT]],
  ["ME2009.pdf", 12, "needs_ocr", "absent", "unknown", [NO_TEXT]],
  ["ME2010.pdf", 16, "needs_ocr", "absent", "unknown", [NO_TEXT]],
  ["ME2011.pdf", 14, "needs_ocr", "absent", "unknown", [NO_TEXT]],
  ["ME2012.pdf", 15, "received", "unknown", "unknown", []],
  ["ME2013.pdf", 56, "needs_review", "unknown", "unknown", [
    "Combines A–D booklet codes labelled as sessions; not 4 distinct exams before deduplication.",
  ]],
  ["ME2014.pdf", 75, "needs_review", "unknown", "unknown", ["Contains multiple sets."]],
  ["ME2015.pdf", 70, "needs_review", "image_body", "unknown", [
    "Contains multiple sets.",
    "Question bodies and answer colouring are image-based despite selectable metadata.",
  ]],
  ["ME2016.pdf", 52, "needs_review", "unknown", "unknown", ["Contains multiple sets."]],
  ["ME2017_1.pdf", 19, "needs_review", "mixed", "unknown", ["Mixed content requires inspection."]],
  ["ME2017_2.pdf", 21, "needs_review", "mixed", "unknown", ["Mixed content requires inspection."]],
  ["ME2018_1.pdf", 20, "received", "unknown", "unknown", []],
  ["ME2018_2.pdf", 21, "received", "unknown", "unknown", []],
  ["ME2019_1.pdf", 25, "needs_ocr", "absent", "unknown", [NO_TEXT]],
  ["ME2019_2.pdf", 25, "needs_ocr", "absent", "unknown", [NO_TEXT]],
  ["ME2020_1.pdf", 19, "needs_review", "mixed", "unknown", ["Mixed content requires inspection."]],
  ["ME2020_2.pdf", 20, "needs_review", "mixed", "unknown", ["Mixed content requires inspection."]],
  ["ME2021_1.pdf", 35, "needs_ocr", "absent", "unknown", [NO_TEXT]],
  ["ME2021_2.pdf", 33, "needs_ocr", "absent", "unknown", [NO_TEXT]],
  ["ME2022_1.pdf", 46, "received", "unknown", "unknown", []],
  ["ME2022_2.pdf", 49, "received", "unknown", "unknown", []],
  ["ME2023.pdf", 56, "received", "unknown", "unknown", []],
  ["ME2024.pdf", 35, "received", "unknown", "unknown", []],
  ["ME2025.pdf", 41, "received", "unknown", "unknown", []],
  ["ME2026.pdf", 44, "received", "unknown", "unknown", []],
];

export const SOURCE_FILES: readonly SourceFile[] = rows.map(
  ([fileName, pageCount, status, textLayer, embedsAnswerKey, notes]) => {
    const m = /^ME(\d{4})(?:_(\d))?\.pdf$/.exec(fileName)!;
    return {
      id: fileName.replace(/\.pdf$/, "").toLowerCase(),
      fileName,
      filenameYear: Number(m[1]),
      filenameSession: m[2] ? Number(m[2]) : null,
      pageCount,
      status,
      textLayer,
      embedsAnswerKey,
      notes,
    };
  },
);

export const INTAKE_SUMMARY = {
  archive: "ME.zip",
  zipIntegrity: "passed",
  byteIdenticalDuplicates: 0,
  verifiedQuestions: 0,
  note: "Some files embed answer keys; their official provenance is unverified.",
} as const;

export const STATUS_LABEL: Record<SourceStatus, string> = {
  received: "Received",
  sampled: "Sampled",
  needs_ocr: "Needs OCR",
  needs_review: "Needs review",
};

export function totalPages(files: readonly SourceFile[] = SOURCE_FILES) {
  return files.reduce((s, f) => s + f.pageCount, 0);
}

export function searchSources(query: string, status: SourceStatus | "all" = "all") {
  const q = query.trim().toLowerCase();
  return SOURCE_FILES.filter(
    (f) =>
      (status === "all" || f.status === status) &&
      (!q ||
        f.fileName.toLowerCase().includes(q) ||
        String(f.filenameYear).includes(q) ||
        STATUS_LABEL[f.status].toLowerCase().includes(q)),
  );
}
