import { createFileRoute } from "@tanstack/react-router";
import { LineChart } from "lucide-react";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DataNotice, EmptyState, PageHeader, meta } from "@/components/app/ui";

export const Route = createFileRoute("/trends")({
  head: () => meta("Trends", "Topic weightage across GATE ME years, from validated evidence only."),
  component: Trends,
});

const WINDOWS = [
  { v: "all", l: "All years" },
  { v: "10", l: "10 years" },
  { v: "5", l: "5 years" },
  { v: "3", l: "3 years" },
];

function Trends() {
  const [win, setWin] = useState("all");
  const label = WINDOWS.find((w) => w.v === win)!.l.toLowerCase();
  return (
    <>
      <PageHeader title="Trends" description="Subject and concept weightage over time.">
        <ToggleGroup type="single" value={win} onValueChange={(v) => v && setWin(v)} aria-label="Time window" className="rounded-xl border p-1">
          {WINDOWS.map((w) => (
            <ToggleGroupItem key={w.v} value={w.v} className="h-10 rounded-lg px-3">{w.l}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PageHeader>
      <DataNotice />
      <EmptyState icon={LineChart} title={`No evidence for ${label}`}>
        Charts are drawn only from validated, deduplicated questions. None exist yet, so nothing is plotted.
      </EmptyState>
    </>
  );
}
