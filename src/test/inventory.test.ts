import { describe, expect, it } from "vitest";
import { SOURCE_FILES, searchSources, totalPages, INTAKE_SUMMARY } from "@/data/source-inventory";
import { parseSettings, DEFAULT_SETTINGS } from "@/lib/local-settings";

describe("source inventory", () => {
  it("has 26 PDFs", () => expect(SOURCE_FILES.length).toBe(26));
  it("totals 859 pages", () => expect(totalPages()).toBe(859));
  it("spans filename years 2007-2026", () => {
    const ys = SOURCE_FILES.map((f) => f.filenameYear);
    expect(Math.min(...ys)).toBe(2007);
    expect(Math.max(...ys)).toBe(2026);
  });
  it("flags exactly 9 PDFs as needing OCR", () =>
    expect(SOURCE_FILES.filter((f) => f.status === "needs_ocr").length).toBe(9));
  it("never marks a file verified and has 0 verified questions", () => {
    expect(SOURCE_FILES.every((f) => ["received", "sampled", "needs_ocr", "needs_review"].includes(f.status))).toBe(true);
    expect(INTAKE_SUMMARY.verifiedQuestions).toBe(0);
  });
  it("searches by year", () => expect(searchSources("2017").map((f) => f.fileName)).toEqual(["ME2017_1.pdf", "ME2017_2.pdf"]));
});

describe("local settings", () => {
  it("defaults to unset minutes, Asia/Kolkata", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.dailyMinutes).toBeNull();
    expect(DEFAULT_SETTINGS.timezone).toBe("Asia/Kolkata");
  });
  it("rejects invalid minutes", () => expect(parseSettings('{"dailyMinutes":-5}').dailyMinutes).toBeNull());
});
