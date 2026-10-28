import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MathMarkdown } from "@/components/app/MathMarkdown";

// Synthetic text only.
const html = (md: string) => render(<MathMarkdown>{md}</MathMarkdown>).container;

describe("safe Markdown + math renderer", () => {
  it("renders inline/display math with KaTeX (log, integral) instead of raw $...$", () => {
    const c = html("Evaluate $\\log_{10} x$ and\n\n$$\n\\int_0^1 x^2\\,dx\n$$");
    expect(c.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(c.querySelector(".katex-display")).not.toBeNull();
    expect(c.textContent).not.toContain("$");
  });
  it("renders GFM tables as tables, not pipes", () => {
    const c = html("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(c.querySelector("table")).not.toBeNull();
    expect(c.querySelectorAll("td")).toHaveLength(2);
    expect(c.textContent).not.toContain("|");
  });
  it("preserves wording", () => {
    expect(html("The value of the integral is (round off to 2 decimal places)").textContent).toBe("The value of the integral is (round off to 2 decimal places)");
  });
  it("drops raw HTML, scripts, event handlers and images", () => {
    const c = html('<script>alert(1)</script><img src=x onerror="alert(1)"><b onclick="x()">b</b>\n\n![p](https://example.com/x.png)');
    expect(c.querySelector("script, img, [onerror], [onclick], b")).toBeNull();
  });
  it("neutralises javascript:/data: links and KaTeX \\href", () => {
    const c = html("[x](javascript:alert(1)) [y](data:text/html,hi) $\\href{javascript:alert(1)}{z}$ [ok](https://gate2026.iitg.ac.in)");
    const hrefs = [...c.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://gate2026.iitg.ac.in"]);
    // \href stays inert text (trust: false); no attribute anywhere carries a dangerous URL.
    const attrs = [...c.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.value));
    expect(attrs.some((v) => /javascript:|data:text/i.test(v))).toBe(false);
  });
});
