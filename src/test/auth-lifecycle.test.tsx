import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthProvider, useAuth, type SessionSource } from "@/lib/auth";
import { AuthForm } from "@/components/app/AuthForm";
import { AccountSettings } from "@/components/app/AccountSettings";
import { useAccountPreferences } from "@/lib/use-account-preferences";
import { preferencesRowSchema, type PreferencesStore } from "@/lib/preferences";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const sess = (id: string) => ({ user: { id, email: `${id.slice(-1)}@example.test` } });

function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}

function fakeSource() {
  let cb: (e: string, s: ReturnType<typeof sess> | null) => void = () => {};
  const initial = deferred<{ data: { session: ReturnType<typeof sess> | null } }>();
  const signOut = vi.fn<() => Promise<{ error: unknown }>>(async () => ({ error: null }));
  const source: SessionSource = {
    onAuthStateChange: (fn) => { cb = fn; return { data: { subscription: { unsubscribe: () => {} } } }; },
    getSession: () => initial.promise,
    signOut,
  };
  return { source, initial, signOut, emit: (e: string, s: ReturnType<typeof sess> | null) => cb(e, s) };
}

function setup(source: SessionSource) {
  const qc = new QueryClient();
  const clear = vi.spyOn(qc, "clear");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><AuthProvider source={source}>{children}</AuthProvider></QueryClientProvider>
  );
  const hook = renderHook(() => useAuth(), { wrapper });
  return { ...hook, clear };
}

describe("AuthProvider lifecycle", () => {
  it("ignores a late initial session after SIGNED_OUT", async () => {
    const f = fakeSource();
    const { result } = setup(f.source);
    act(() => f.emit("SIGNED_OUT", null));
    await act(async () => { f.initial.resolve({ data: { session: sess(A) } }); });
    expect(result.current.status).toBe("signed_out");
    expect(result.current.user).toBeNull();
  });

  it("ignores a late initial session after SIGNED_IN for a different user and clears cache on switches", async () => {
    const f = fakeSource();
    const { result, clear } = setup(f.source);
    act(() => f.emit("SIGNED_IN", sess(B)));
    await act(async () => { f.initial.resolve({ data: { session: sess(A) } }); });
    expect(result.current.user?.id).toBe(B);
    clear.mockClear();
    act(() => f.emit("SIGNED_IN", sess(A)));
    expect(clear).toHaveBeenCalledTimes(1);
    act(() => f.emit("SIGNED_OUT", null));
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("ignores a late bootstrap failure after a newer event", async () => {
    const f = fakeSource();
    const { result } = setup(f.source);
    act(() => f.emit("SIGNED_IN", sess(A)));
    await act(async () => { f.initial.reject(new Error("net")); });
    expect(result.current.status).toBe("signed_in");
  });

  it("keeps signed-in state and exposes an error when signOut returns {error}", async () => {
    const f = fakeSource();
    f.signOut.mockResolvedValueOnce({ error: { message: "network" } });
    const { result } = setup(f.source);
    await act(async () => { f.initial.resolve({ data: { session: sess(A) } }); });
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.signOut(); });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("signed_in");
    expect(result.current.signOutError).toMatch(/still signed in/);
  });

  it("keeps signed-in state when signOut throws", async () => {
    const f = fakeSource();
    f.signOut.mockRejectedValueOnce(new Error("boom"));
    const { result } = setup(f.source);
    await act(async () => { f.initial.resolve({ data: { session: sess(A) } }); });
    await act(async () => { await result.current.signOut(); });
    expect(result.current.status).toBe("signed_in");
    expect(result.current.signOutError).not.toBeNull();
  });

  it("prevents double sign-out and never overwrites a newer account", async () => {
    const f = fakeSource();
    const d = deferred<{ error: unknown }>();
    f.signOut.mockReturnValueOnce(d.promise);
    const { result } = setup(f.source);
    await act(async () => { f.initial.resolve({ data: { session: sess(A) } }); });
    let p!: Promise<boolean>;
    act(() => { p = result.current.signOut(); });
    expect(result.current.signOutPending).toBe(true);
    await act(async () => { expect(await result.current.signOut()).toBe(false); });
    expect(f.signOut).toHaveBeenCalledTimes(1);
    act(() => f.emit("SIGNED_IN", sess(B)));
    await act(async () => { d.resolve({ error: null }); await p; });
    expect(result.current.user?.id).toBe(B);
    expect(result.current.status).toBe("signed_in");
  });

  it("signs out only after provider confirms", async () => {
    const f = fakeSource();
    const { result } = setup(f.source);
    await act(async () => { f.initial.resolve({ data: { session: sess(A) } }); });
    await act(async () => { await result.current.signOut(); });
    expect(result.current.status).toBe("signed_out");
  });
});

describe("account switch isolation", () => {
  const row = (id: string, mins: number) => ({ user_id: id, daily_minutes: mins, timezone: "Asia/Kolkata", reset_time: "04:00:00" });

  it("hook never exposes old account state or saves it under the new uid", async () => {
    const dB = deferred<{ data: unknown; error: null }>();
    const store: PreferencesStore = {
      select: vi.fn((id: string) => (id === A ? Promise.resolve({ data: row(A, 90), error: null }) : dB.promise)),
      insert: vi.fn(),
      update: vi.fn(async (id: string, patch) => ({ data: { user_id: id, ...patch, reset_time: patch.reset_time + ":00" }, error: null })),
    };
    const seen: string[] = [];
    const { result, rerender } = renderHook(({ uid }) => {
      const h = useAccountPreferences(uid, store);
      seen.push(`${uid}:${h.state.status}:${h.state.status === "ready" ? h.state.prefs.dailyMinutes : ""}`);
      return h;
    }, { initialProps: { uid: A } });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const oldSave = result.current.save;
    seen.length = 0;
    rerender({ uid: B });
    expect(seen.some((x) => x.startsWith(B) && x.includes(":90"))).toBe(false);
    expect(result.current.state.status).toBe("loading");
    await act(async () => { await oldSave({ dailyMinutes: 90, timezone: "Asia/Kolkata", resetTime: "04:00" }); });
    await act(async () => { await result.current.save({ dailyMinutes: 90, timezone: "Asia/Kolkata", resetTime: "04:00" }); });
    expect(store.update).not.toHaveBeenCalled();
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("AccountSettings shows no old values or success message after switching account", async () => {
    const store: PreferencesStore = {
      select: vi.fn(async (id: string) => (id === A ? { data: row(A, 90), error: null } : { data: row(B, 30), error: null })),
      insert: vi.fn(),
      update: vi.fn(async (id: string, patch) => ({ data: { user_id: id, ...patch, reset_time: patch.reset_time + ":00" }, error: null })),
    };
    const ui = (uid: string) => <AccountSettings key={uid} userId={uid} email={null} onSignOut={() => {}} store={store} />;
    const { rerender } = render(ui(A));
    await waitFor(() => expect(screen.getByLabelText("Daily study minutes")).toHaveValue("90"));
    fireEvent.click(screen.getByRole("button", { name: "Save to account" }));
    expect(await screen.findByText("Saved to your account.")).toBeInTheDocument();
    rerender(ui(B));
    expect(screen.queryByText("Saved to your account.")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("90")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Daily study minutes")).toHaveValue("30"));
    expect(store.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(store.update).mock.calls[0]?.[0]).toBe(A);
  });
});

describe("AuthForm pending safety", () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  };

  it("disables mode tabs while pending", async () => {
    const d = deferred<{ error: string | null }>();
    render(<AuthForm client={{ signIn: vi.fn(() => d.promise), signUp: vi.fn() }} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const tab = screen.getByRole("tab", { name: "Create account" });
    expect(tab).toBeDisabled();
    fireEvent.click(tab);
    expect(screen.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
    await act(async () => { d.resolve({ error: null }); });
    expect(tab).not.toBeDisabled();
  });

  it("recovers from a thrown client error", async () => {
    render(<AuthForm client={{ signIn: vi.fn(async () => { throw new Error("x"); }), signUp: vi.fn() }} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong/);
    expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
  });

  it("ignores completion after unmount", async () => {
    const d = deferred<{ error: string | null }>();
    const onSignedIn = vi.fn();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<AuthForm client={{ signIn: vi.fn(() => d.promise), signUp: vi.fn() }} onSignedIn={onSignedIn} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    unmount();
    await act(async () => { d.resolve({ error: null }); });
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("preferences row timezone", () => {
  it("rejects a corrupted server timezone", () => {
    expect(preferencesRowSchema.safeParse({ user_id: A, daily_minutes: null, timezone: "Mars/Olympus", reset_time: "04:00:00" }).success).toBe(false);
    expect(preferencesRowSchema.safeParse({ user_id: A, daily_minutes: null, timezone: "Asia/Kolkata", reset_time: "04:00:00" }).success).toBe(true);
  });
});
