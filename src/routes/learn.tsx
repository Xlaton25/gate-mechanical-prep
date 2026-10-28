import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataNotice, EmptyState, PageHeader, meta } from "@/components/app/ui";
import { LoadFailed, Loading, SignedIn } from "@/components/app/learning";
import { getCorpus } from "@/lib/learning.functions";
import type { TopicNode } from "@/lib/progress";

export const Route = createFileRoute("/learn")({
  head: () => meta("Learning Hub", "Syllabus topics linked to validated GATE ME questions, practice and revision."),
  component: () => (
    <>
      <PageHeader title="Learning Hub" description="The syllabus topics your validated questions are mapped to." />
      <DataNotice>No lesson or formula pages are shown: none have been reviewed yet. Worked solutions appear only after you submit an answer.</DataNotice>
      <SignedIn what="the Learning Hub">{(uid) => <Hub userId={uid} />}</SignedIn>
    </>
  ),
});

function Hub({ userId }: { userId: string }) {
  const fn = useServerFn(getCorpus);
  const q = useQuery({ queryKey: ["learn", userId, "corpus"], queryFn: () => fn({ data: { expectedUserId: userId } }) });
  if (q.isPending) return <Loading label="Loading topics" />;
  if (q.isError || !q.data.ok) return <LoadFailed onRetry={() => q.refetch()} />;
  const { topics, counts } = q.data.corpus;
  if (topics.length === 0) return <EmptyState icon={BookOpen} title="No topics yet">Topics appear once validated questions are mapped.</EmptyState>;
  const kids = (id: string | null) => topics.filter((t) => t.parentId === id).sort((a, b) => a.name.localeCompare(b.name));
  const total = (t: TopicNode): number => counts.filter((c) => c.topicId === t.id).length + kids(t.id).reduce((s, k) => s + total(k), 0);
  const Node = ({ t, depth }: { t: TopicNode; depth: number }) => {
    const n = total(t);
    return (
      <li>
        <div className="flex min-h-11 items-center gap-2" style={{ paddingLeft: depth * 16 }}>
          <span className={depth === 0 ? "font-semibold" : ""}>{t.name}</span>
          <span className="text-xs text-muted-foreground">{n} question{n === 1 ? "" : "s"}</span>
          {n > 0 && <Button size="sm" variant="ghost" className="ml-auto" asChild><Link to="/pyq">Practise</Link></Button>}
        </div>
        {kids(t.id).length > 0 && <ul>{kids(t.id).map((k) => <Node key={k.id} t={k} depth={depth + 1} />)}</ul>}
      </li>
    );
  };
  return (
    <div className="surface p-4">
      <ul className="divide-y divide-border">{kids(null).map((t) => <Node key={t.id} t={t} depth={0} />)}</ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to="/pyq">Filter questions by topic</Link></Button>
        <Button asChild variant="outline"><Link to="/revision">Open revision</Link></Button>
      </div>
    </div>
  );
}
