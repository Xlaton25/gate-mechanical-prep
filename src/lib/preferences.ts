import { z } from "zod";
import type { LocalStudySettings } from "@/domain/types";

/**
 * Account-synced study preferences (public.user_preferences).
 * Pure logic over a narrow store port so it is testable without a network.
 * Rules: rows are only read/written for the signed-in uid; absent rows are
 * inserted, existing rows are updated with ONLY the three preference columns
 * (user_id is never part of an update payload — it is not even granted).
 */

export const PREF_COLUMNS = "user_id,daily_minutes,timezone,reset_time" as const;
export const SERVER_DEFAULTS: LocalStudySettings = { dailyMinutes: null, timezone: "Asia/Kolkata", resetTime: "04:00" };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const preferencesInputSchema = z.object({
  dailyMinutes: z.number().int().min(1).max(1440).nullable(),
  timezone: z.string().trim().min(1).max(64).refine(isValidTimezone, "Unknown timezone"),
  resetTime: z.string().regex(HHMM, "Use HH:mm (00:00–23:59)"),
});

/** Row as returned by PostgREST. time(0) arrives as HH:mm:ss; seconds must be 00. */
export const preferencesRowSchema = z.object({
  user_id: z.string().uuid(),
  daily_minutes: z.number().int().min(1).max(1440).nullable(),
  timezone: z.string().min(1).max(64).refine(isValidTimezone, "Unknown timezone"),
  reset_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/),
});

export type PreferencesRow = z.infer<typeof preferencesRowSchema>;
export type PreferencesPatch = { daily_minutes: number | null; timezone: string; reset_time: string };
export interface StoreError { code?: string; message: string }
export interface StoreResult { data: unknown; error: StoreError | null }

export interface PreferencesStore {
  select(userId: string): Promise<StoreResult>;
  insert(row: PreferencesRow): Promise<StoreResult>;
  update(userId: string, patch: PreferencesPatch): Promise<StoreResult>;
}

export type PrefsFailure = { ok: false; reason: "setup_pending" | "failed" | "invalid" | "mismatch"; message: string };
export type PrefsLoaded = { ok: true; prefs: LocalStudySettings; exists: boolean };

const SETUP_CODES = new Set(["42P01", "PGRST205", "PGRST202", "PGRST204", "3F000"]);

export function classifyError(err: StoreError): PrefsFailure {
  if (err.code && SETUP_CODES.has(err.code)) {
    return { ok: false, reason: "setup_pending", message: "Account preferences aren't set up on the server yet." };
  }
  return { ok: false, reason: "failed", message: "Couldn't reach your saved preferences. Check your connection and try again." };
}

function rowToPrefs(row: PreferencesRow): LocalStudySettings {
  return { dailyMinutes: row.daily_minutes, timezone: row.timezone, resetTime: row.reset_time.slice(0, 5) };
}

function parseRow(data: unknown, userId: string): PrefsLoaded | PrefsFailure {
  const parsed = preferencesRowSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: "invalid", message: "The server returned preferences in an unexpected format." };
  if (parsed.data.user_id !== userId) return { ok: false, reason: "mismatch", message: "Received preferences for a different account; ignored." };
  return { ok: true, prefs: rowToPrefs(parsed.data), exists: true };
}

export async function loadPreferences(store: PreferencesStore, userId: string): Promise<PrefsLoaded | PrefsFailure> {
  const { data, error } = await store.select(userId);
  if (error) return classifyError(error);
  // No row yet: show server defaults, but do NOT write anything until the user saves.
  if (data == null) return { ok: true, prefs: SERVER_DEFAULTS, exists: false };
  return parseRow(data, userId);
}

export function toPatch(input: LocalStudySettings): PreferencesPatch {
  return { daily_minutes: input.dailyMinutes, timezone: input.timezone.trim(), reset_time: input.resetTime };
}

export async function savePreferences(
  store: PreferencesStore,
  userId: string,
  input: LocalStudySettings,
  exists: boolean,
): Promise<PrefsLoaded | PrefsFailure> {
  const v = preferencesInputSchema.safeParse(input);
  if (!v.success) return { ok: false, reason: "invalid", message: v.error.issues[0]?.message ?? "Invalid preferences" };
  const patch = toPatch(v.data);

  if (!exists) {
    const ins = await store.insert({ user_id: userId, ...patch });
    if (!ins.error) return parseRow(ins.data, userId);
    // Row created meanwhile (another tab): fall through to a column-only update.
    if (ins.error.code !== "23505") return classifyError(ins.error);
  }
  const upd = await store.update(userId, patch);
  if (upd.error) return classifyError(upd.error);
  if (upd.data == null) return { ok: false, reason: "failed", message: "Your preferences row wasn't found. Reload and try again." };
  return parseRow(upd.data, userId);
}
