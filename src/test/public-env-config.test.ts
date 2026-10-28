import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression: .env was git-ignored, so hosted builds had no VITE_SUPABASE_* and /auth showed "Sign-in is unavailable".
describe("public Supabase browser config", () => {
  const env = readFileSync(".env", "utf8");
  const vars = Object.fromEntries(
    env.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
  );

  it("is not git-ignored, so hosted builds receive it", () => {
    let ignored = true;
    try { execSync("git check-ignore -q .env"); } catch { ignored = false; }
    expect(ignored).toBe(false);
  });

  it("defines the browser URL and publishable key for the GATE project", () => {
    expect(vars["VITE_SUPABASE_URL"]).toBe("https://utlagjareqqrtztmlmgz.supabase.co");
    expect(vars["VITE_SUPABASE_PUBLISHABLE_KEY"]?.startsWith("sb_publishable_")).toBe(true);
  });

  it("contains no secret keys", () => {
    expect(env).not.toMatch(/SERVICE_ROLE|sb_secret_/i);
  });
});
