import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LineChart } from "lucide-react";
import { DataNotice, EmptyState, PageHeader, Panel, meta } from "@/components/app/ui";
import { LoadFailed, Loading, SignedIn } from "@/components/app/learning";
import { getCorpus } from "@/lib/learning.functions";
import { rootOf } from "@/lib/progress";

export const Route = createFileRoute("/trends")({
  head: () => meta("Trends", "Descriptive counts of validated GATE ME questions and marks by subject and year."),
  component: () => (
    <>
      <PageHeader title="Trends" description="What the validated question bank contains — descriptive counts only." />
      <DataNotice>Partial pilot: 10 questions from one 2026 session. This is not a historical trend or a forecast, and no priority percentages are given.</DataNotice>
      <SignedIn what="corpus counts">{(uid) => <Counts userId={uid} />}</SignedIn>
    </>
  ),
});

function Counts({ userId }: { userId: string }) {
  const fn = useServerFn(getCorpus);
  const q = useQuery({ queryKey: ["learn", userId, "corpus"], queryFn: () => fn({ data: { expectedUserId: userId } }) });
  if (q.isPending) return <Loading label="Loading counts" />;
  if (q.isError || !q.data.ok) return <LoadFailed onRetry={() => q.refetch()} />;
  const { topics, counts } = q.data.corpus;
  if (counts.length === 0) return <EmptyState icon={LineChart} title="No validated questions">Nothing to count yet.</EmptyState>;
  const map = new Map(topics.map((t) => [t.id, t]));
  const rows = new Map<string, { q: number; marks: number; years: Set<number> }>();
  for (const c of counts) {
    const s = rootOf(map, c.topicId)?.name ?? "Untagged";
    const r = rows.get(s) ?? { q: 0, marks: 0, years: new Set<number>() };
    r.q++; r.marks += c.marks; r.years.add(c.year);
    rows.set(s, r);
  }
  const years = [...new Set(counts.map((c) => c.year))].sort();
  return (
    <Panel title={`By subject · ${years.join(", ")}`}>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Subject</th><th>Questions</th><th>Marks</th></tr></thead>
        <tbody>
          {[...rows.entries()].sort((a, b) => b[1].marks - a[1].marks).map(([s, r]) => (
            <tr key={s} className="border-t border-border"><td className="py-2">{s}</td><td>{r.q}</td><td>{r.marks}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">{counts.length} questions · {counts.reduce((s, c) => s + c.marks, 0)} marks total.</p>
    </Panel>
  );
}
