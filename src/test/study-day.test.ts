import { describe, expect, it } from "vitest";
import { studyDay } from "@/lib/study-day";

// Asia/Kolkata = UTC+05:30
describe("studyDay (Asia/Kolkata)", () => {
  it("before reset belongs to previous local date", () => {
    // 2026-10-28 03:59 IST
    expect(studyDay(new Date("2026-10-27T22:29:00Z"))).toBe("2026-10-27");
  });
  it("exactly at reset starts the new day", () => {
    expect(studyDay(new Date("2026-10-27T22:30:00Z"))).toBe("2026-10-28");
  });
  it("UTC date differs from local date", () => {
    // 2026-10-27 20:00Z = 2026-10-28 01:30 IST, before 04:00 → 27; with 00:00 reset → 28
    expect(studyDay(new Date("2026-10-27T20:00:00Z"))).toBe("2026-10-27");
    expect(studyDay(new Date("2026-10-27T20:00:00Z"), "Asia/Kolkata", "00:00")).toBe("2026-10-28");
  });
  it("crosses the year boundary", () => {
    expect(studyDay(new Date("2026-12-31T22:00:00Z"))).toBe("2026-12-31"); // 03:30 IST Jan 1
    expect(studyDay(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01-01"); // 05:30 IST Jan 1
  });
  it("handles March 1 → Feb 29 in a leap year", () => {
    // 2028-03-01 02:00 IST
    expect(studyDay(new Date("2028-02-29T20:30:00Z"))).toBe("2028-02-29");
  });
  it("custom reset 23:59", () => {
    expect(studyDay(new Date("2026-10-28T18:28:00Z"), "Asia/Kolkata", "23:59")).toBe("2026-10-27"); // 23:58 IST
    expect(studyDay(new Date("2026-10-28T18:29:00Z"), "Asia/Kolkata", "23:59")).toBe("2026-10-28");
  });
  it("rejects bad input", () => {
    expect(() => studyDay(new Date("x"))).toThrow(RangeError);
    expect(() => studyDay(new Date(), "Asia/Kolkata", "24:00")).toThrow(RangeError);
    expect(() => studyDay(new Date(), "Asia/Kolkata", "4:00")).toThrow(RangeError);
    expect(() => studyDay(new Date(), "Not/AZone")).toThrow(RangeError);
  });
});
