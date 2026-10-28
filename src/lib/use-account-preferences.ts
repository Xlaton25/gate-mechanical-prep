import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalStudySettings } from "@/domain/types";
import { loadPreferences, savePreferences, type PrefsFailure, type PreferencesStore } from "./preferences";

export type AccountPrefsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; failure: PrefsFailure }
  | { status: "ready"; prefs: LocalStudySettings; exists: boolean; saving: boolean; saveError: PrefsFailure | null; savedAt: number | null };

type Owned = { owner: string | null; value: AccountPrefsState };

/**
 * Loads/saves preferences for exactly one uid. Internal state carries an owner
 * token; if it doesn't match the current uid (e.g. during the render right after
 * an account switch, before effects run) callers see "loading" and save() is a
 * no-op, so an old account's values can never render or be written for a new uid.
 * Every async response is also tagged with an epoch and dropped if stale.
 */
export function useAccountPreferences(userId: string | null, store: PreferencesStore) {
  const [owned, setOwned] = useState<Owned>({ owner: null, value: { status: "idle" } });
  const epoch = useRef(0);
  const uidRef = useRef(userId);
  uidRef.current = userId;

  const load = useCallback(() => {
    const my = ++epoch.current;
    if (!userId) { setOwned({ owner: null, value: { status: "idle" } }); return; }
    setOwned({ owner: userId, value: { status: "loading" } });
    loadPreferences(store, userId).then(
      (r) => {
        if (epoch.current !== my || uidRef.current !== userId) return;
        setOwned({ owner: userId, value: r.ok ? { status: "ready", prefs: r.prefs, exists: r.exists, saving: false, saveError: null, savedAt: null } : { status: "error", failure: r } });
      },
      () => { if (epoch.current === my && uidRef.current === userId) setOwned({ owner: userId, value: { status: "error", failure: { ok: false, reason: "failed", message: "Couldn't load your preferences." } } }); },
    );
  }, [userId, store]);

  useEffect(() => {
    load();
    return () => { epoch.current++; };
  }, [load]);

  const state: AccountPrefsState = owned.owner === userId ? owned.value : userId ? { status: "loading" } : { status: "idle" };

  const save = useCallback(async (input: LocalStudySettings) => {
    const s = owned.value;
    if (!userId || owned.owner !== userId || s.status !== "ready" || s.saving) return;
    const my = epoch.current;
    setOwned({ owner: userId, value: { ...s, saving: true, saveError: null, savedAt: null } });
    let r;
    try { r = await savePreferences(store, userId, input, s.exists); }
    catch { r = { ok: false as const, reason: "failed" as const, message: "Couldn't save your preferences." }; }
    if (epoch.current !== my || uidRef.current !== userId) return;
    setOwned((o) => {
      if (o.owner !== userId || o.value.status !== "ready") return o;
      return {
        owner: userId,
        value: r.ok
          ? { status: "ready", prefs: r.prefs, exists: true, saving: false, saveError: null, savedAt: Date.now() }
          : { ...o.value, saving: false, saveError: r },
      };
    });
  }, [userId, store, owned]);

  return { state, save, reload: load };
}
