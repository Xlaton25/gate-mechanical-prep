import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Canonical SQL (db/migrations) vs what was applied to the owned GATE project (supabase/migrations),
// ignoring comments and whitespace only.
const norm = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const canon = (...names: string[]) => norm(names.map((n) => readFileSync(`db/migrations/${n}.sql`, "utf8")).join("\n"));
const applied = (version: string) => {
  const f = readdirSync("supabase/migrations").find((n) => n.startsWith(`${version}_`));
  if (!f) throw new Error(`applied migration ${version} not found`);
  return norm(readFileSync(`supabase/migrations/${f}`, "utf8"));
};

describe("canonical vs applied migration parity", () => {
  it("000001–000003 = combined 20261028040618", () => {
    expect(applied("20261028040618")).toBe(canon("20261027000001_core_schema", "20261027000002_security", "20261027000003_integrity_hardening"));
  });
  it("000004 = 20261028163911", () => {
    expect(applied("20261028163911")).toBe(canon("20261028000004_practice_submission"));
  });
});
