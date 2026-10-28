import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalStudySettings } from "@/domain/types";
import { loadPreferences, savePreferences, type PrefsFailure, type PreferencesStore } from "./preferences";

export type AccountPrefsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; failure: PrefsFailure }
  | { status: "ready"; prefs: LocalStudySettings; exists: boolean; saving: boolean; saveError: PrefsFailure | null; savedAt: number | null };

/**
 * Loads/saves preferences for exactly one uid. Every response is tagged with the
 * epoch it started in; a uid change (sign-out / account switch) bumps the epoch and
 * clears state, so late responses from a previous account are dropped.
 */
export function useAccountPreferences(userId: string | null, store: PreferencesStore) {
  const [state, setState] = useState<AccountPrefsState>({ status: "idle" });
  const epoch = useRef(0);

  const load = useCallback(() => {
    const my = ++epoch.current;
    if (!userId) { setState({ status: "idle" }); return; }
    setState({ status: "loading" });
    loadPreferences(store, userId).then(
      (r) => {
        if (epoch.current !== my) return;
        setState(r.ok ? { status: "ready", prefs: r.prefs, exists: r.exists, saving: false, saveError: null, savedAt: null } : { status: "error", failure: r });
      },
      () => { if (epoch.current === my) setState({ status: "error", failure: { ok: false, reason: "failed", message: "Couldn't load your preferences." } }); },
    );
  }, [userId, store]);

  useEffect(() => {
    load();
    return () => { epoch.current++; };
  }, [load]);

  const save = useCallback(async (input: LocalStudySettings) => {
    if (!userId || state.status !== "ready" || state.saving) return;
    const my = epoch.current;
    const exists = state.exists;
    setState({ ...state, saving: true, saveError: null, savedAt: null });
    let r;
    try { r = await savePreferences(store, userId, input, exists); }
    catch { r = { ok: false as const, reason: "failed" as const, message: "Couldn't save your preferences." }; }
    if (epoch.current !== my) return;
    setState((s) => {
      if (s.status !== "ready") return s;
      return r.ok
        ? { status: "ready", prefs: r.prefs, exists: true, saving: false, saveError: null, savedAt: Date.now() }
        : { ...s, saving: false, saveError: r };
    });
  }, [userId, store, state]);

  return { state, save, reload: load };
}
