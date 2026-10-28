import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Lock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataNotice, PageHeader, Panel, meta } from "@/components/app/ui";
import { INTAKE_SUMMARY, SOURCE_FILES, totalPages } from "@/data/source-inventory";
import { useLocalSettings } from "@/lib/local-settings";

export const Route = createFileRoute("/")({
  head: () => meta("Dashboard", "Today's practice, due revisions, study availability and source coverage."),
  component: Dashboard,
});

const CHECKLIST = [
  { label: "Source archive received (ME.zip, 26 PDFs)", done: true },
  { label: "Owned backend connected", done: true },
  { label: "OCR for image-only PDFs", done: false },
  { label: "Questions extracted and validated (10-question ME2026 pilot)", done: true },
  { label: "Answer keys versioned with provenance (pilot only)", done: true },
  { label: "Daily practice enabled", done: false },
];

function Dashboard() {
  const { settings, loaded } = useLocalSettings();
  return (
    <>
      <PageHeader title="Dashboard" description="Your GATE 2027 Mechanical preparation, built on evidence only." />
      <DataNotice />
      <div className="grid gap-4 md:grid-cols-3">
        <section className="surface p-6 md:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-secondary p-2 text-secondary-foreground"><Target className="size-5" aria-hidden /></div>
            <h2 className="text-lg font-semibold">Today's practice</h2>
          </div>
          <p className="text-muted-foreground">
            Daily sets of 10 questions will appear here once questions are validated and answers are checked on the server.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button disabled aria-describedby="practice-why"><Lock aria-hidden /> Start practice</Button>
            <Button variant="outline" asChild><Link to="/admin">View sources</Link></Button>
          </div>
          <p id="practice-why" className="mt-3 text-sm text-muted-foreground">Disabled: 0 of 0 questions verified.</p>
        </section>

        <Panel title="Due revisions">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">Nothing due. Items join the queue after real practice attempts.</p>
          </div>
        </Panel>

        <Panel title="Setup checklist" className="md:col-span-2">
          <ul className="space-y-2">
            {CHECKLIST.map((c) => (
              <li key={c.label} className="flex items-center gap-3 text-sm">
                <span aria-hidden className={`size-2.5 rounded-full ${c.done ? "bg-primary" : "border border-input"}`} />
                <span className={c.done ? "" : "text-muted-foreground"}>{c.label}</span>
                <span className="sr-only">{c.done ? "done" : "not done"}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Study availability">
          {!loaded ? null : settings.dailyMinutes ? (
            <p className="text-sm"><span className="text-2xl font-semibold">{settings.dailyMinutes}</span> min/day</p>
          ) : (
            <p className="text-sm text-muted-foreground">Not set.</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{settings.timezone} · resets {settings.resetTime}</p>
          <Button variant="link" className="mt-1 px-0" asChild><Link to="/settings">Edit in Settings</Link></Button>
        </Panel>

        <Panel title="Coverage" className="md:col-span-3">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Source PDFs" value={SOURCE_FILES.length} />
            <Stat label="PDF pages" value={totalPages()} />
            <Stat label="Filename years" value="2007–2026" />
            <Stat label="Verified questions" value={INTAKE_SUMMARY.verifiedQuestions} />
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">File counts are not session or question coverage. Concept coverage appears once questions are validated.</p>
        </Panel>
      </div>
    </>
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
