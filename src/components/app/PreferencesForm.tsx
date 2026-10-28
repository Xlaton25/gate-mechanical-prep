import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LocalStudySettings } from "@/domain/types";
import { isValidTimezone } from "@/lib/preferences";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function PreferencesForm({
  initial, disabled, busy, submitLabel, onSubmit, onDirty, status, extra,
}: {
  initial: LocalStudySettings;
  disabled?: boolean;
  busy?: boolean;
  submitLabel: string;
  onSubmit: (v: LocalStudySettings) => void;
  onDirty?: () => void;
  status?: ReactNode;
  extra?: ReactNode;
}) {
  const [mins, setMins] = useState("");
  const [tz, setTz] = useState(initial.timezone);
  const [rt, setRt] = useState(initial.resetTime);

  useEffect(() => {
    setMins(initial.dailyMinutes ? String(initial.dailyMinutes) : "");
    setTz(initial.timezone);
    setRt(initial.resetTime);
  }, [initial]);

  const minsNum = mins.trim() === "" ? null : Number(mins);
  const minsValid = minsNum === null || (Number.isInteger(minsNum) && minsNum > 0 && minsNum <= 1440);
  const tzValid = isValidTimezone(tz.trim());
  const rtValid = HHMM.test(rt);
  const valid = minsValid && tzValid && rtValid;
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); onDirty?.(); };

  return (
    <form
      className="grid max-w-md gap-5"
      onSubmit={(e) => { e.preventDefault(); if (valid && !disabled && !busy) onSubmit({ dailyMinutes: minsNum, timezone: tz.trim(), resetTime: rt }); }}
    >
      <fieldset disabled={disabled} className="grid gap-5 disabled:opacity-60">
        <div className="grid gap-2">
          <Label htmlFor="mins">Daily study minutes</Label>
          <Input id="mins" inputMode="numeric" placeholder="Not set" value={mins} onChange={(e) => change(setMins)(e.target.value)} className="h-11 rounded-xl" aria-invalid={!minsValid} />
          {!minsValid && <p className="text-sm text-destructive">Enter a whole number from 1 to 1440, or leave empty.</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tz">Timezone</Label>
          <Input id="tz" value={tz} onChange={(e) => change(setTz)(e.target.value)} className="h-11 rounded-xl" aria-invalid={!tzValid} />
          {!tzValid && <p className="text-sm text-destructive">Use an IANA timezone such as Asia/Kolkata.</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rt">Daily reset time</Label>
          <Input id="rt" type="time" step={60} value={rt} onChange={(e) => change(setRt)(e.target.value)} className="h-11 rounded-xl" aria-invalid={!rtValid} />
          {!rtValid && <p className="text-sm text-destructive">Use a time from 00:00 to 23:59.</p>}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!valid || disabled || busy}>{busy ? "Saving…" : submitLabel}</Button>
        {extra}
        <span role="status" className="text-sm text-muted-foreground">{status}</span>
      </div>
    </form>
  );
}
