import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, meta } from "@/components/app/ui";
import { LoadFailed, Loading, SignedIn } from "@/components/app/learning";
import { exportProgress, getAnalytics } from "@/lib/learning.functions";
import { fmtThirds, pct } from "@/lib/progress";

export const Route = createFileRoute("/analytics")({
  head: () => meta("Analytics", "Accuracy, net marks, time and consistency by topic from your saved attempts."),
  component: () => (
    <>
      <PageHeader title="Analytics" description="From your saved attempts only. Practice scores are not a predicted GATE rank." />
      <SignedIn what="your analytics">{(uid) => <Stats userId={uid} />}</SignedIn>
    </>
  ),
});

function Stats({ userId }: { userId: string }) {
  const fn = useServerFn(getAnalytics);
  const exp = useServerFn(exportProgress);
  const [expErr, setExpErr] = useState(false);
  const q = useQuery({ queryKey: ["learn", userId, "analytics"], queryFn: () => fn({ data: { expectedUserId: userId } }) });
  if (q.isPending) return <Loading label="Loading analytics" />;
  if (q.isError || !q.data.ok) return <LoadFailed onRetry={() => q.refetch()} />;
  const s = q.data.summary;
  const download = async () => {
    setExpErr(false);
    const r = await exp({ data: { expectedUserId: userId } }).catch(() => null);
    if (!r?.ok) return setExpErr(true);
    const url = URL.createObjectURL(new Blob([r.json], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `gate-progress-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportBtn = (
    <div className="flex items-center gap-3">
      <Button variant="outline" onClick={() => void download()}><Download aria-hidden /> Export my progress (JSON)</Button>
      {expErr && <span role="alert" className="text-sm text-destructive">Export failed. Try again.</span>}
    </div>
  );
  if (s.attempts === 0)
    return <div className="space-y-4"><EmptyState icon={BarChart3} title="No attempts recorded" action={<Button asChild><Link to="/practice">Start practising</Link></Button>}>Nothing is charted until you save attempts.</EmptyState>{exportBtn}</div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="Accuracy"><p className="text-2xl font-semibold">{pct(s.accuracy)}</p><p className="text-xs text-muted-foreground">{s.correct} correct · {s.wrong} wrong · {s.unanswered} blank (excluded)</p></Panel>
        <Panel title="Net marks"><p className="text-2xl font-semibold">{fmtThirds(s.netThirds)}</p><p className="text-xs text-muted-foreground">{s.attempts} saved attempts</p></Panel>
        <Panel title="Time"><p className="text-2xl font-semibold">{s.minutes} min</p><p className="text-xs text-muted-foreground">from saved durations</p></Panel>
        <Panel title="Consistency"><p className="text-2xl font-semibold">{s.streak}-day streak</p><p className="text-xs text-muted-foreground">{s.activeDays} active study day{s.activeDays === 1 ? "" : "s"}</p></Panel>
      </div>
      <Panel title="By topic">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Topic</th><th>Attempts</th><th>Accuracy</th><th>Blank</th><th>Net</th><th>Time</th></tr></thead>
            <tbody>
              {s.byTopic.map((t) => (
                <tr key={t.topicId} className="border-t border-border">
                  <td className="py-2"><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.subject}</div></td>
                  <td>{t.attempts}</td>
                  <td>{pct(t.accuracy)}{t.limited && <span className="block text-xs text-muted-foreground">limited evidence</span>}</td>
                  <td>{t.unanswered}</td>
                  <td>{fmtThirds(t.netThirds)}</td>
                  <td>{Math.round(t.timeSec / 60)}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Recommendation">
          {s.weakTopic ? <p className="text-sm">Revisit <strong>{s.weakTopic.name}</strong> — {pct(s.weakTopic.accuracy)} on {s.weakTopic.correct + s.weakTopic.wrong} answered{s.weakTopic.limited ? " (limited evidence)" : ""}.</p>
            : <p className="text-sm text-muted-foreground">No topic is below 60% on answered attempts.</p>}
        </Panel>
        <Panel title="Recent activity">
          <ul className="space-y-1 text-sm">
            {s.recent.map((a, i) => <li key={i} className="flex justify-between gap-2"><span>{a.status === "correct" ? "Correct" : a.status === "wrong" ? "Wrong" : "Blank"} · {fmtThirds(a.marksThirds)}</span><span className="text-muted-foreground">{new Date(a.submittedAt).toLocaleString()}</span></li>)}
          </ul>
        </Panel>
      </div>
      {exportBtn}
    </div>
  );
}
