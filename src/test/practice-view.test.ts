import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePracticeView } from "@/server/practice/view.server";

const QID = "00000000-0000-4000-8000-000000000001";
const row = (o: Record<string, unknown> = {}) => ({
  id: QID, number: 3, type: "MCQ", marks: 1, exam_year: 2026, session_label: "synthetic", topic: "Synthetic Area",
  body_md: "Synthetic body", options: [{ id: "B", body_md: "beta" }, { id: "A", body_md: "alpha" }],
  revision: "0123456789abcdef0123456789abcdef", ...o,
});

describe("single-snapshot practice view", () => {
  it("copies only allowlisted fields, even if the row carries key/solution data", () => {
    const v = parsePracticeView(row({ mcq_option: "B", solution_md: "secret", nat_ranges: [{ min: "1", max: "2" }] }), QID);
    expect(v).not.toBeNull();
    expect(Object.keys(v!).sort()).toEqual(["bodyMd", "id", "marks", "number", "options", "revision", "session", "topic", "type", "year"]);
    expect(JSON.stringify(v)).not.toMatch(/secret|mcq_option|nat_ranges/);
    expect(v!.options.map((o) => o.id)).toEqual(["A", "B"]);
  });

  it("body, options and revision come from the same row (never mixed with another read)", () => {
    const v = parsePracticeView(row({ options: [{ id: "A", body_md: "alpha" }, { id: "B", body_md: "beta reworded" }], revision: "f".repeat(32) }), QID);
    expect(v!.options[1]!.bodyMd).toBe("beta reworded");
    expect(v!.revision).toBe("f".repeat(32));
  });

  it("rejects a row for another question, a bad revision or malformed options", () => {
    expect(parsePracticeView(row({ id: "00000000-0000-4000-8000-000000000002" }), QID)).toBeNull();
    expect(parsePracticeView(row({ revision: "nope" }), QID)).toBeNull();
    expect(parsePracticeView(row({ options: [{ id: "Z", body_md: "x" }] }), QID)).toBeNull();
    expect(parsePracticeView(row({ type: "ESSAY" }), QID)).toBeNull();
    expect(parsePracticeView(null, QID)).toBeNull();
  });

  it("the detail handler reads question + revision through the one view, not two statements", () => {
    const src = readFileSync("src/lib/practice.functions.ts", "utf8");
    const detail = src.slice(src.indexOf("export const getPracticeQuestion"), src.indexOf("export const submitPracticeAttempt"));
    expect(detail).toContain("fetchPracticeView");
    expect(detail).not.toMatch(/fetchPracticeRevision|\.from\("questions"\)/);
  });
});
