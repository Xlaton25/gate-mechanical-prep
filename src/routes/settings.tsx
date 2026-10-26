import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Panel, meta } from "@/components/app/ui";
import { useLocalSettings } from "@/lib/local-settings";

export const Route = createFileRoute("/settings")({
  head: () => meta("Settings", "Local study availability, timezone and daily reset time."),
  component: Settings,
});

function Settings() {
  const { settings, loaded, save, reset } = useLocalSettings();
  const [mins, setMins] = useState("");
  const [tz, setTz] = useState(settings.timezone);
  const [rt, setRt] = useState(settings.resetTime);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    setMins(settings.dailyMinutes ? String(settings.dailyMinutes) : "");
    setTz(settings.timezone);
    setRt(settings.resetTime);
  }, [loaded, settings]);

  const minsNum = mins.trim() === "" ? null : Number(mins);
  const minsValid = minsNum === null || (Number.isInteger(minsNum) && minsNum > 0 && minsNum <= 1440);

  return (
    <>
      <PageHeader title="Settings" />
      <div role="note" className="surface mb-6 flex gap-3 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Saved only in this browser on this device. There is no login or cross-device sync yet; clearing site data erases these settings.</p>
      </div>
      <Panel title="Study availability">
        <form
          className="grid max-w-md gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!minsValid) return;
            save({ dailyMinutes: minsNum, timezone: tz.trim() || "Asia/Kolkata", resetTime: rt });
            setSaved(true);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="mins">Daily study minutes</Label>
            <Input id="mins" inputMode="numeric" placeholder="Not set" value={mins} onChange={(e) => { setMins(e.target.value); setSaved(false); }} className="h-11 rounded-xl" aria-invalid={!minsValid} />
            {!minsValid && <p className="text-sm text-destructive">Enter a whole number from 1 to 1440, or leave empty.</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tz">Timezone</Label>
            <Input id="tz" value={tz} onChange={(e) => { setTz(e.target.value); setSaved(false); }} className="h-11 rounded-xl" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rt">Daily reset time</Label>
            <Input id="rt" type="time" value={rt} onChange={(e) => { setRt(e.target.value); setSaved(false); }} className="h-11 rounded-xl" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!minsValid}>Save on this device</Button>
            <Button type="button" variant="outline" onClick={() => { reset(); setSaved(false); }}>Reset to defaults</Button>
            <span role="status" className="text-sm text-muted-foreground">{saved ? "Saved locally." : ""}</span>
          </div>
        </form>
      </Panel>
    </>
  );
}
