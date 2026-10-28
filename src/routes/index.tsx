import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader, Panel, meta } from "@/components/app/ui";
import { LoadFailed, Loading, SignedIn, qLabel } from "@/components/app/learning";
import { getToday, setChecklist } from "@/lib/learning.functions";
import type { DailyReason } from "@/lib/learning-schema";
import { fmtThirds, pct } from "@/lib/progress";

export const Route = createFileRoute("/")({
  head: () => meta("Dashboard", "Today's 10, due revisions, accuracy and study streak from your saved attempts."),
  component: Dashboard,
});

const REASON: Record<DailyReason, string> = { due_revision: "Due revision", weak_topic: "Weak topic", unseen: "New", least_recent: "Repeat" };
const TASKS = ["Finish today's set", "Clear due revisions", "Review one mistake's solution"];

function Dashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your GATE 2027 Mechanical preparation, from your own saved attempts." />
      <SignedIn what="today's set">{(uid) => <Today userId={uid} />}</SignedIn>
    </>
  );
}

function Today({ userId }: { userId: string }) {
  const todayFn = useServerFn(getToday);
  const checkFn = useServerFn(setChecklist);
  const qc = useQueryClient();
  const key = ["learn", userId, "today"];
  const q = useQuery({ queryKey: key, queryFn: () => todayFn({ data: { expectedUserId: userId } }) });
  if (q.isPending) return <Loading label="Loading today's set" />;
  if (q.isError || !q.data.ok) return <LoadFailed onRetry={() => q.refetch()} setup={q.data && !q.data.ok && q.data.error === "setup_pending"} />;
  const t = q.data.today;
  const s = t.summary;
  const done = t.items.filter((i) => i.done).length;
  const ids = t.items.map((i) => i.id);
  const next = t.items.find((i) => !i.done) ?? t.items[0]!;
  const toggle = async (task: number, v: boolean) => {
    await checkFn({ data: { expectedUserId: userId, studyDay: t.studyDay, task, done: v } }).catch(() => null);
    void qc.invalidateQueries({ queryKey: key });
  };
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="surface p-6 md:col-span-2">
        <div className="mb-2 flex items-center gap-3">
          <div className="rounded-xl bg-secondary p-2 text-secondary-foreground"><Target className="size-5" aria-hidden /></div>
          <h2 className="text-lg font-semibold">Today's set</h2>
          <span className="ml-auto text-sm tabular-nums text-muted-foreground">{done}/{t.items.length} done</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Study day {t.studyDay} · resets {t.resetTime} ({t.timezone})</p>
        {t.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No eligible questions yet, so no set was made.</p>
        ) : (
          <>
            {t.items.length < 10 && (
              <p className="mb-3 rounded-xl bg-secondary p-3 text-xs text-secondary-foreground">
                Only {t.poolSize} validated question{t.poolSize === 1 ? "" : "s"} exist so far, so today's set has {t.items.length}, and questions repeat across days.
              </p>
            )}
            <ol className="mb-4 grid gap-1 sm:grid-cols-2">
              {t.items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${i.done ? "bg-primary" : "border border-input"}`} />
                  <span className="truncate">{qLabel(i)}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{REASON[i.reason]}</span>
                </li>
              ))}
            </ol>
            <Button asChild><Link to="/practice" search={{ ids: ids.join(","), q: next.id, set: t.assignmentId }}>{done === 0 ? "Start" : done < t.items.length ? "Continue" : "Review set"}</Link></Button>
          </>
        )}
      </section>

      <Panel title="Due revisions">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-2xl font-semibold tabular-nums">{t.dueCount}</p>
            <Button variant="link" className="px-0" asChild><Link to="/revision">Open revision</Link></Button>
          </div>
        </div>
      </Panel>

      <Panel title="Your numbers">
        {s.attempts === 0 ? <p className="text-sm text-muted-foreground">No saved attempts yet.</p> : (
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Accuracy" value={pct(s.accuracy)} />
            <Stat label="Net marks" value={fmtThirds(s.netThirds)} />
            <Stat label="Streak" value={`${s.streak} day${s.streak === 1 ? "" : "s"}`} />
            <Stat label="Today" value={`${s.minutesToday}${t.dailyMinutes ? `/${t.dailyMinutes}` : ""} min`} />
          </dl>
        )}
        {s.unanswered > 0 && <p className="mt-2 text-xs text-muted-foreground">{s.unanswered} left blank (not in accuracy).</p>}
      </Panel>

      <Panel title="Suggested focus">
        {s.weakTopic ? (
          <p className="text-sm">{s.weakTopic.name} · {pct(s.weakTopic.accuracy)} over {s.weakTopic.correct + s.weakTopic.wrong}{s.weakTopic.limited ? " (limited evidence)" : ""}</p>
        ) : <p className="text-sm text-muted-foreground">No weak topic yet — needs answered attempts below 60%.</p>}
        <Button variant="link" className="px-0" asChild><Link to="/analytics">See analytics</Link></Button>
      </Panel>

      <Panel title="Today's checklist">
        <ul className="space-y-2">
          {TASKS.map((label, i) => (
            <li key={label}>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <Checkbox checked={t.checklist[i] ?? false} onCheckedChange={(v) => void toggle(i + 1, v === true)} />
                {label}
              </label>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
