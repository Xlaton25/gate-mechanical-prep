import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StaticAuthProvider, type AuthState } from "@/lib/auth";
import { PracticeSession, type PracticeApi } from "@/components/app/PracticeSession";
import type { SubmitInput, SubmitResult } from "@/lib/practice-schema";

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
const Q = { id: "00000000-0000-4000-8000-00000000b001", number: 1, type: "MCQ" as const, marks: 1, year: 2026, session: "" };
const api = (submit: (i: SubmitInput) => Promise<SubmitResult>): PracticeApi => ({
  list: async () => ({ ok: true, questions: [Q], attempts: [] }),
  detail: async () => ({ ok: true, question: { ...Q, bodyMd: "Synthetic body", options: ["A", "B", "C", "D"].map((id) => ({ id, bodyMd: `opt ${id}` })) } }),
  submit,
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
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
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
});
