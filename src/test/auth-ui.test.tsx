import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthForm } from "@/components/app/AuthForm";
import { AccountSettings } from "@/components/app/AccountSettings";
import type { AuthClient } from "@/lib/auth";
import type { PreferencesStore } from "@/lib/preferences";

const fill = (email: string, pw: string) => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: pw } });
};

describe("AuthForm", () => {
  it("uses correct autocomplete per mode", () => {
    render(<AuthForm client={{ signIn: vi.fn(), signUp: vi.fn() }} />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });
  it("validates before calling the service", async () => {
    const client: AuthClient = { signIn: vi.fn(), signUp: vi.fn() };
    render(<AuthForm client={client} />);
    fill("not-an-email", "short");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/);
    expect(client.signIn).not.toHaveBeenCalled();
  });
  it("shows pending then error on failed sign-in", async () => {
    let resolve: (v: { error: string | null }) => void = () => {};
    const client: AuthClient = { signIn: vi.fn(() => new Promise((r) => { resolve = r; })), signUp: vi.fn() };
    render(<AuthForm client={client} />);
    fill("a@example.com", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
    resolve({ error: "Email or password is incorrect." });
    expect(await screen.findByRole("alert")).toHaveTextContent("incorrect");
  });
  it("shows email confirmation state when signup returns no session", async () => {
    const onSignedIn = vi.fn();
    const client: AuthClient = { signIn: vi.fn(), signUp: vi.fn(async () => ({ error: null, needsConfirmation: true })) };
    render(<AuthForm client={client} onSignedIn={onSignedIn} />);
    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    fill("new@example.com", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText("new@example.com")).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});

describe("AccountSettings", () => {
  const uid = "11111111-1111-4111-8111-111111111111";
  it("disables save until loaded, then shows setup-pending when tables are absent", async () => {
    const store: PreferencesStore = {
      select: vi.fn(async () => ({ data: null, error: { code: "PGRST205", message: "relation missing" } })),
      insert: vi.fn(), update: vi.fn(),
    };
    render(<AccountSettings userId={uid} email="a@example.com" onSignOut={() => {}} store={store} />);
    expect(screen.getByText("Loading your preferences…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save to account" })).not.toBeInTheDocument();
    expect(await screen.findByText(/aren't set up on the server yet/)).toBeInTheDocument();
    expect(store.insert).not.toHaveBeenCalled();
  });
  it("shows defaults for an absent row without writing", async () => {
    const store: PreferencesStore = { select: vi.fn(async () => ({ data: null, error: null })), insert: vi.fn(), update: vi.fn() };
    render(<AccountSettings userId={uid} email={null} onSignOut={() => {}} store={store} />);
    await waitFor(() => expect(screen.getByLabelText("Timezone")).toHaveValue("Asia/Kolkata"));
    expect(screen.getByLabelText("Daily reset time")).toHaveValue("04:00");
    expect(store.insert).not.toHaveBeenCalled();
  });
});
