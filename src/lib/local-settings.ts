import { useEffect, useState } from "react";
import type { LocalStudySettings } from "@/domain/types";

const KEY = "gate27me.settings.v1";

export const DEFAULT_SETTINGS: LocalStudySettings = {
  dailyMinutes: null,
  timezone: "Asia/Kolkata",
  resetTime: "04:00",
};

export function parseSettings(raw: string | null): LocalStudySettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<LocalStudySettings>;
    const mins = v.dailyMinutes;
    return {
      dailyMinutes:
        typeof mins === "number" && Number.isFinite(mins) && mins > 0 && mins <= 1440
          ? Math.round(mins)
          : null,
      timezone: typeof v.timezone === "string" && v.timezone ? v.timezone : DEFAULT_SETTINGS.timezone,
      resetTime:
        typeof v.resetTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.resetTime)
          ? v.resetTime
          : DEFAULT_SETTINGS.resetTime,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Local-only (this browser). Not synced, not tied to any login. */
export function useLocalSettings() {
  const [settings, setSettings] = useState<LocalStudySettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setSettings(parseSettings(localStorage.getItem(KEY)));
    setLoaded(true);
  }, []);
  const save = (next: LocalStudySettings) => {
    setSettings(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };
  const reset = () => {
    localStorage.removeItem(KEY);
    setSettings(DEFAULT_SETTINGS);
  };
  return { settings, loaded, save, reset };
}

const THEME_KEY = "gate27me.theme";
export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    const d = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
  }, []);
  const toggle = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    localStorage.setItem(THEME_KEY, d ? "dark" : "light");
  };
  return { dark, toggle };
}
