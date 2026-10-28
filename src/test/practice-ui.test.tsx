import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { StaticAuthProvider, type AuthState } from "@/lib/auth";
import { PracticeSession, type PracticeApi } from "@/components/app/PracticeSession";
import type { SubmitInput, SubmitResult } from "@/lib/practice-schema";
import { submitAttempt, submitBound, type PracticeStore } from "@/server/practice/submit.server";

vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: ReactNode }) => <a href="/auth">{children}</a>,
}));

const auth = (over: Partial<AuthState>): AuthState => ({ status: "signed_in", user: { id: "u1", email: null }, signOut: async () => true, signOutPending: false, signOutError: null, ...over });
const wrap = (a: AuthState, api: PracticeApi) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StaticAuthProvider value={a}><PracticeSession api={api} /></StaticAuthProvider>
    </QueryClientProvider>,
  );
const Q = { id: "00000000-0000-4000-8000-00000000b001", number: 1, type: "MCQ" as const, marks: 1, year: 2026, session: "", revision: "f".repeat(32), topic: "Synthetic topic", sourcePage: 3, sourceFile: "SYNTHETIC.pdf" };
const api = (submit: (i: SubmitInput, expected: string) => Promise<SubmitResult>): PracticeApi => ({
  list: async () => ({ ok: true, questions: [Q], attempts: [] }),
  detail: async () => ({ ok: true, question: { ...Q, bodyMd: "Synthetic body", options: ["A", "B", "C", "D"].map((id) => ({ id, bodyMd: `opt ${id}` })) } }),
  submit: (expected, i) => submit(i, expected),
});

describe("practice screen", () => {
  it("signed out requires sign-in and calls nothing", () => {
    const list = vi.fn();
    wrap(auth({ status: "signed_out", user: null }), { list, detail: vi.fn(), submit: vi.fn() });
    expect(screen.getByText("Sign in for scored practice")).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
  it("honest empty state with no validated content", async () => {
    wrap(auth({}), { list: async () => ({ ok: true, questions: [], attempts: [] }), detail: vi.fn(), submit: vi.fn() });
    expect(await screen.findByText("No validated questions yet")).toBeInTheDocument();
  });
  it("retry after a failure reuses the same submission id; solution shows only after save", async () => {
    const ids: string[] = [];
    let n = 0;
    const submit = vi.fn(async (i: SubmitInput): Promise<SubmitResult> => {
      ids.push(i.submissionId);
      if (n++ === 0) throw new Error("network");
      return { ok: true, outcome: "created", attempt: { id: "a1", questionId: Q.id, status: "correct", marksThirds: 3, submittedAt: "2026-10-28T10:00:00Z" }, solutionMd: "Synthetic solution" };
    });
    wrap(auth({}), api(submit));
    fireEvent.click(await screen.findByRole("button", { name: /Q1/ }));
    fireEvent.click(await screen.findByRole("button", { name: "B" }));
    expect(screen.queryByText("Synthetic solution")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("won't be counted twice");
    fireEvent.click(screen.getByRole("button", { name: "Retry saving" }));
    expect(await screen.findByText("Synthetic solution")).toBeInTheDocument();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(submit.mock.calls[0]![0]).not.toHaveProperty("userId");
  });
  it("a completion for a previous account is not shown to the next account", async () => {
    let resolve!: (r: SubmitResult) => void;
    const submit = vi.fn(() => new Promise<SubmitResult>((r) => { resolve = r; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (a: AuthState) => (
      <QueryClientProvider client={client}><StaticAuthProvider value={a}><PracticeSession api={api(submit)} /></StaticAuthProvider></QueryClientProvider>
    );
    const { rerender } = render(tree(auth({})));
    fireEvent.click(await screen.findByRole("button", { name: /Q1/ }));
    fireEvent.click(await screen.findByRole("button", { name: "B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    rerender(tree(auth({ user: { id: "u2", email: null } })));
    resolve({ ok: true, outcome: "created", attempt: { id: "a1", questionId: Q.id, status: "correct", marksThirds: 3, submittedAt: "2026-10-28T10:00:00Z" }, solutionMd: "Previous user's solution" });
    await waitFor(() => expect(submit).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Previous user's solution")).not.toBeInTheDocument();
  });

  it("lost response after save + clock advance: retry resends the frozen input and yields the one original row", async () => {
    const rows = new Map<string, { hash: string; attempt: { id: string; question_id: string; status: string; marks_thirds: number; submitted_at: string } }>();
    const ctx = {
      question_id: Q.id, type: "MCQ", marks: 1, paper_year: 2026, option_ids: ["A", "B", "C", "D"], fingerprint: "f".repeat(32),
      policy: { id: "gate-2026-v1", exam_year: 2026, verified: true, mcq_penalty_thirds_1: 1, mcq_penalty_thirds_2: 2, msq_negative: false, nat_negative: false, partial_credit: false },
      key: { id: "synthetic-key-1", version: 1, type: "MCQ", verified: true, mcq_option: "B", msq_options: null, nat_ranges: [] },
    };
    const store: PracticeStore = {
      async lookup(u, sub, hash) {
        const r = rows.get(u + sub);
        return r ? (r.hash === hash ? { outcome: "replay", attempt: r.attempt, solution_md: "Synthetic solution" } : { outcome: "conflict" }) : null;
      },
      async loadContext() { return ctx; },
      async record(a) {
        const attempt = { id: `row-${rows.size + 1}`, question_id: a.questionId, status: a.status, marks_thirds: a.marksThirds, submitted_at: "2026-10-28T10:00:00Z" };
        rows.set(a.userId + a.submissionId, { hash: a.requestHash, attempt });
        return { outcome: "created", attempt, solution_md: "Synthetic solution" };
      },
    };
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const sent: SubmitInput[] = [];
    let call = 0;
    const submit = vi.fn(async (i: SubmitInput, expected: string) => {
      sent.push(structuredClone(i));
      const r = await submitBound(store, "u1", { expectedUserId: expected, submission: i });
      if (call++ === 0) throw new Error("response lost after commit");
      return r;
    });
    wrap(auth({ user: { id: "u1", email: null } }), api(submit));
    fireEvent.click(await screen.findByRole("button", { name: /Q1/ }));
    now.mockReturnValue(1_007_000);
    fireEvent.click(await screen.findByRole("button", { name: "B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeDisabled(); // answer frozen until resolved
    now.mockReturnValue(1_090_000); // time passes before the retry
    fireEvent.click(screen.getByRole("button", { name: "Retry saving" }));
    expect(await screen.findByText("Synthetic solution")).toBeInTheDocument();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[0]!.durationSec).toBe(7);
    expect(rows.size).toBe(1);
    now.mockRestore();
  });
  it("rapid double submit sends once", async () => {
    let resolve!: (r: SubmitResult) => void;
    const submit = vi.fn(() => new Promise<SubmitResult>((r) => { resolve = r; }));
    wrap(auth({}), api(submit));
    fireEvent.click(await screen.findByRole("button", { name: /Q1/ }));
    fireEvent.click(await screen.findByRole("button", { name: "B" }));
    const form = screen.getByRole("button", { name: "Submit answer" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledTimes(1);
    resolve({ ok: false, error: "stale" });
  });
  it("completions still apply under React StrictMode effect replay", async () => {
    const submit = vi.fn(async (): Promise<SubmitResult> => ({ ok: true, outcome: "created", attempt: { id: "a1", questionId: Q.id, status: "correct", marksThirds: 3, submittedAt: "2026-10-28T10:00:00Z" }, solutionMd: "Strict solution" }));
    render(
      <StrictMode>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <StaticAuthProvider value={auth({})}><PracticeSession api={api(submit)} /></StaticAuthProvider>
        </QueryClientProvider>
      </StrictMode>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Q1/ }));
    fireEvent.click(await screen.findByRole("button", { name: "B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(await screen.findByText("Strict solution")).toBeInTheDocument();
  });
  it("every call is bound to the signed-in account; a switch during token attachment saves nothing for anyone", async () => {
    let session = "u1";
    let release!: () => void;
    const token = new Promise<void>((r) => { release = r; });
    const record = vi.fn();
    const store: PracticeStore = { lookup: vi.fn(async () => null), loadContext: vi.fn(), record };
    const seen: string[] = [];
    const a: PracticeApi = {
      list: async (e) => { seen.push(`list:${e}`); return { ok: true, questions: [Q], attempts: [] }; },
      detail: async (e) => { seen.push(`detail:${e}`); return { ok: true, question: { ...Q, bodyMd: "Synthetic body", options: [{ id: "A", bodyMd: "a" }, { id: "B", bodyMd: "b" }] } }; },
      submit: async (e, i) => { await token; return submitBound(store, session, { expectedUserId: e, submission: i }); },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (s: AuthState) => <QueryClientProvider client={client}><StaticAuthProvider value={s}><PracticeSession api={a} /></StaticAuthProvider></QueryClientProvider>;
    const { rerender } = render(tree(auth({})));
    fireEvent.click(await screen.findByRole("button", { name: /Q1/ }));
    fireEvent.click(await screen.findByRole("button", { name: "B" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    session = "u2";
    rerender(tree(auth({ user: { id: "u2", email: null } })));
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(record).not.toHaveBeenCalled();
    expect(store.loadContext).not.toHaveBeenCalled();
    expect(seen).toEqual(["list:u1", "detail:u1", "list:u2"]);
  });
  it("renders question math and tables, not raw markdown", async () => {
    const a = api(vi.fn());
    a.detail = async () => ({ ok: true, question: { ...Q, bodyMd: "Find $\\log_e 2$\n\n| x | y |\n|---|---|\n| 1 | 2 |", options: [{ id: "A", bodyMd: "$\\int_0^1 x\\,dx$" }] } });
    const { container } = wrap(auth({}), a);
    fireEvent.click(await screen.findByRole("button", { name: /Q1/ }));
    await screen.findByRole("table");
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toContain("$");
  });
});
