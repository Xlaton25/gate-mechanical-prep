import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, ListRestart, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, meta } from "@/components/app/ui";
import { LoadFailed, Loading, PracticeLink, SignedIn, qLabel } from "@/components/app/learning";
import { getRevision } from "@/lib/learning.functions";
import type { RevisionEntry } from "@/lib/learning-schema";

export const Route = createFileRoute("/revision")({
  head: () => meta("Revision", "Spaced revision queue, mistake notebook and saved questions from your own attempts."),
  component: () => (
    <>
      <PageHeader title="Revision" description="Spaced repetition at 1, 3, 7, 14 and 30 days, from your own attempts." />
      <SignedIn what="your revision">{(uid) => <RevisionTabs userId={uid} />}</SignedIn>
    </>
  ),
});

function RevisionTabs({ userId }: { userId: string }) {
  const fn = useServerFn(getRevision);
  const q = useQuery({ queryKey: ["learn", userId, "revision"], queryFn: () => fn({ data: { expectedUserId: userId } }) });
  if (q.isPending) return <Loading label="Loading revision" />;
  if (q.isError || !q.data.ok) return <LoadFailed onRetry={() => q.refetch()} />;
  const r = q.data.revision;
  return (
    <Tabs defaultValue="due">
      <TabsList className="mb-4 h-12 rounded-xl">
        <TabsTrigger value="due" className="h-10 rounded-lg px-4">Due ({r.due.length})</TabsTrigger>
        <TabsTrigger value="mistakes" className="h-10 rounded-lg px-4">Mistakes ({r.mistakes.length})</TabsTrigger>
        <TabsTrigger value="saved" className="h-10 rounded-lg px-4">Saved ({r.saved.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="due">
        <List rows={r.due} action="Practise due" empty={<EmptyState icon={ListRestart} title="Nothing due">Wrong or blank answers come back after 1 day; correct reviews move to 3, 7, 14, then 30 days.</EmptyState>}
          note={(e) => `due ${new Date(e.dueAt!).toLocaleDateString()} · step ${e.intervalDays}d`} />
        {r.upcoming.length > 0 && <div className="mt-6"><h3 className="mb-2 text-sm font-semibold text-muted-foreground">Upcoming</h3>
          <List rows={r.upcoming} note={(e) => `due ${new Date(e.dueAt!).toLocaleDateString()}`} empty={null} /></div>}
      </TabsContent>
      <TabsContent value="mistakes">
        <List rows={r.mistakes} action="Retry mistakes" empty={<EmptyState icon={XCircle} title="No mistakes logged">Questions whose latest saved answer was wrong or blank appear here.</EmptyState>}
          note={(e) => `${e.lastStatus === "wrong" ? "wrong" : "blank"} · ${new Date(e.lastAt!).toLocaleDateString()}`} />
      </TabsContent>
      <TabsContent value="saved">
        <List rows={r.saved} action="View saved" empty={<EmptyState icon={Bookmark} title="Nothing saved">Use Save on any question to keep it here.</EmptyState>} />
      </TabsContent>
    </Tabs>
  );
}

function List({ rows, empty, action, note }: { rows: RevisionEntry[]; empty: React.ReactNode; action?: string; note?: (e: RevisionEntry) => string }) {
  if (rows.length === 0) return <>{empty}</>;
  const ids = rows.map((r) => r.id);
  return (
    <div className="surface p-4">
      {action && <div className="mb-3"><PracticeLink ids={ids} variant="default">{action}</PracticeLink></div>}
      <ul className="divide-y divide-border">
        {rows.map((e) => (
          <li key={e.id}>
            <PracticeLink ids={ids} id={e.id}>
              <span className="flex w-full flex-col">
                <span className="font-medium">{qLabel(e)}</span>
                <span className="text-xs text-muted-foreground">{[e.subject, e.topic, note?.(e)].filter(Boolean).join(" · ")}</span>
              </span>
            </PracticeLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
