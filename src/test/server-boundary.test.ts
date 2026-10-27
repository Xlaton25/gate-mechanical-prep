import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("server-only boundary", () => {
  it("no client-side module imports src/server or *.server files", () => {
    const client = walk(root).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${path.sep}server${path.sep}`) && !f.includes(`${path.sep}test${path.sep}`),
    );
    const offenders = client.filter((f) => /from\s+["'][^"']*(\/server\/|\.server["'])/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("every file under src/server uses the .server suffix", () => {
    const files = walk(path.join(root, "server")).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => !/\.server\.tsx?$/.test(f))).toEqual([]);
  });
});
