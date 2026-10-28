import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { loadPreferences, savePreferences, SERVER_DEFAULTS, type PreferencesStore, type StoreResult } from "@/lib/preferences";
import { useAccountPreferences } from "@/lib/use-account-preferences";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const row = (user_id: string, over: Record<string, unknown> = {}) => ({ user_id, daily_minutes: 90, timezone: "Asia/Kolkata", reset_time: "05:30:00", ...over });
const ok = (data: unknown): StoreResult => ({ data, error: null });

function fakeStore(over: Partial<PreferencesStore> = {}): PreferencesStore {
  return {
    select: vi.fn(async () => ok(null)),
    insert: vi.fn(async (r) => ok({ ...r, reset_time: `${r.reset_time}:00` })),
    update: vi.fn(async (uid, p) => ok({ user_id: uid, ...p })),
    ...over,
  };
}
const input = { dailyMinutes: 120, timezone: "Asia/Kolkata", resetTime: "04:15" };

describe("loadPreferences", () => {
  it("absent row shows server defaults and writes nothing", async () => {
    const s = fakeStore();
    expect(await loadPreferences(s, A)).toEqual({ ok: true, prefs: SERVER_DEFAULTS, exists: false });
    expect(s.insert).not.toHaveBeenCalled();
    expect(s.update).not.toHaveBeenCalled();
  });
  it("maps HH:mm:ss to HH:mm", async () => {
    const r = await loadPreferences(fakeStore({ select: async () => ok(row(A)) }), A);
    expect(r).toEqual({ ok: true, exists: true, prefs: { dailyMinutes: 90, timezone: "Asia/Kolkata", resetTime: "05:30" } });
  });
  it("missing table → setup_pending", async () => {
    const r = await loadPreferences(fakeStore({ select: async () => ({ data: null, error: { code: "PGRST205", message: "x" } }) }), A);
    expect(r).toMatchObject({ ok: false, reason: "setup_pending" });
  });
  it("network failure → failed", async () => {
    const r = await loadPreferences(fakeStore({ select: async () => ({ data: null, error: { message: "fetch failed" } }) }), A);
    expect(r).toMatchObject({ ok: false, reason: "failed" });
  });
  it("rejects a row belonging to another account", async () => {
    const r = await loadPreferences(fakeStore({ select: async () => ok(row(B)) }), A);
    expect(r).toMatchObject({ ok: false, reason: "mismatch" });
  });
  it("rejects a reset time with seconds", async () => {
    const r = await loadPreferences(fakeStore({ select: async () => ok(row(A, { reset_time: "05:30:15" })) }), A);
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("savePreferences", () => {
  it("inserts when absent, with own user_id", async () => {
    const s = fakeStore();
    const r = await savePreferences(s, A, input, false);
    expect(s.insert).toHaveBeenCalledWith({ user_id: A, daily_minutes: 120, timezone: "Asia/Kolkata", reset_time: "04:15" });
    expect(s.update).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, exists: true });
  });
  it("update payload never contains user_id", async () => {
    const s = fakeStore();
    await savePreferences(s, A, input, true);
    expect(s.insert).not.toHaveBeenCalled();
    const [uid, patch] = (s.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(uid).toBe(A);
    expect(Object.keys(patch).sort()).toEqual(["daily_minutes", "reset_time", "timezone"]);
  });
  it("insert conflict falls back to column-only update", async () => {
    const s = fakeStore({ insert: vi.fn(async () => ({ data: null, error: { code: "23505", message: "dup" } })) });
    const r = await savePreferences(s, A, input, false);
    expect(s.update).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
  });
  it("update matching no row is a failure, not success", async () => {
    const r = await savePreferences(fakeStore({ update: async () => ok(null) }), A, input, true);
    expect(r).toMatchObject({ ok: false, reason: "failed" });
  });
  it.each([["24:00"], ["4:15"], ["04:15:30"], [""]])("rejects reset time %s without calling the server", async (t) => {
    const s = fakeStore();
    const r = await savePreferences(s, A, { ...input, resetTime: t }, true);
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(s.update).not.toHaveBeenCalled();
  });
  it("accepts 00:00 and 23:59", async () => {
    for (const t of ["00:00", "23:59"]) expect((await savePreferences(fakeStore(), A, { ...input, resetTime: t }, true)).ok).toBe(true);
  });
  it("rejects unknown timezone and out-of-range minutes", async () => {
    expect((await savePreferences(fakeStore(), A, { ...input, timezone: "Mars/Base" }, true)).ok).toBe(false);
    expect((await savePreferences(fakeStore(), A, { ...input, dailyMinutes: 1441 }, true)).ok).toBe(false);
    expect((await savePreferences(fakeStore(), A, { ...input, dailyMinutes: 0 }, true)).ok).toBe(false);
  });
});

describe("useAccountPreferences isolation", () => {
  it("drops a slow response from the previous account after a switch", async () => {
    let releaseA: (v: StoreResult) => void = () => {};
    const store = fakeStore({
      select: vi.fn((uid: string) =>
        uid === A ? new Promise<StoreResult>((r) => { releaseA = r; }) : Promise.resolve(ok(row(B, { daily_minutes: 30 })))),
    });
    const { result, rerender } = renderHook(({ uid }) => useAccountPreferences(uid, store), { initialProps: { uid: A as string | null } });
    expect(result.current.state.status).toBe("loading");
    rerender({ uid: B });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(async () => { releaseA(ok(row(A, { daily_minutes: 999 }))); });
    expect(result.current.state).toMatchObject({ status: "ready", prefs: { dailyMinutes: 30 } });
  });
  it("clears state on sign-out", async () => {
    const store = fakeStore({ select: async () => ok(row(A)) });
    const { result, rerender } = renderHook(({ uid }) => useAccountPreferences(uid, store), { initialProps: { uid: A as string | null } });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    rerender({ uid: null });
    expect(result.current.state).toEqual({ status: "idle" });
  });
  it("ignores a save that completes after the account changed", async () => {
    let releaseSave: (v: StoreResult) => void = () => {};
    const store = fakeStore({
      select: vi.fn(async (uid: string) => ok(row(uid))),
      update: vi.fn(() => new Promise<StoreResult>((r) => { releaseSave = r; })),
    });
    const { result, rerender } = renderHook(({ uid }) => useAccountPreferences(uid, store), { initialProps: { uid: A as string | null } });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    let p: Promise<void> = Promise.resolve();
    act(() => { p = result.current.save(input); });
    rerender({ uid: B });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "ready", prefs: { dailyMinutes: 90 } }));
    await act(async () => { releaseSave(ok(row(A, { daily_minutes: 120 }))); await p; });
    expect(result.current.state).toMatchObject({ status: "ready", saving: false, savedAt: null, prefs: { dailyMinutes: 90 } });
  });
  it("surfaces save failure and keeps the form usable", async () => {
    const store = fakeStore({ select: async () => ok(row(A)), update: async () => ({ data: null, error: { message: "boom" } }) });
    const { result } = renderHook(() => useAccountPreferences(A, store));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(async () => { await result.current.save(input); });
    expect(result.current.state).toMatchObject({ status: "ready", saving: false, saveError: { reason: "failed" } });
  });
});
