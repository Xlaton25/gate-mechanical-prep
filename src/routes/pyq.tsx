import { createFileRoute } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataNotice, EmptyState, PageHeader, meta } from "@/components/app/ui";
import { LoadFailed, Loading, PracticeLink, SignedIn, qLabel } from "@/components/app/learning";
import { searchQuestions } from "@/lib/learning.functions";
import type { SearchInput } from "@/lib/learning-schema";

export const Route = createFileRoute("/pyq")({
  head: () => meta("PYQ Explorer", "Search and filter validated GATE ME previous-year questions."),
  component: () => (
    <>
      <PageHeader title="PYQ Explorer" description="Search validated questions by year, topic, type, marks and your attempts." />
      <DataNotice>Coverage: a partial 10-question ME2026 pilot. The rest of the 26-paper archive isn't validated yet, so filters only reach these questions.</DataNotice>
      <SignedIn what="the question bank">{(uid) => <Explorer userId={uid} />}</SignedIn>
    </>
  ),
});

type F = Omit<SearchInput, "expectedUserId">;
const sel = "h-11 rounded-xl border border-input bg-background px-3 text-sm";

function Explorer({ userId }: { userId: string }) {
  const fn = useServerFn(searchQuestions);
  const [f, setF] = useState<F>({ q: "", year: null, topicId: null, type: null, marks: null, attempted: "any", page: 0 });
  const [text, setText] = useState("");
  const q = useQuery({ queryKey: ["learn", userId, "pyq", f], queryFn: () => fn({ data: { expectedUserId: userId, ...f } }), placeholderData: keepPreviousData });
  const set = (p: Partial<F>) => setF((o) => ({ ...o, ...p, page: p.page ?? 0 }));
  if (q.isPending) return <Loading label="Loading questions" />;
  if (q.isError || !q.data.ok) return <LoadFailed onRetry={() => q.refetch()} />;
  const s = q.data.search;
  const ids = s.rows.map((r) => r.id);
  const pages = Math.max(1, Math.ceil(s.total / s.pageSize));
  const depth = (id: string | null): number => { let d = 0; for (let t = s.topics.find((x) => x.id === id); t?.parentId && d < 10; t = s.topics.find((x) => x.id === t!.parentId)) d++; return d; };
  return (
    <div className="space-y-4">
      <form className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); set({ q: text }); }} role="search">
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
          <Input className="h-11" value={text} maxLength={100} onChange={(e) => setText(e.target.value)} placeholder="Search question text" aria-label="Search question text" />
          <Button type="submit" className="h-11"><Search aria-hidden /> Search</Button>
        </div>
        <select aria-label="Year" className={sel} value={f.year ?? ""} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null })}>
          <option value="">All years</option>{s.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select aria-label="Topic" className={sel} value={f.topicId ?? ""} onChange={(e) => set({ topicId: e.target.value || null })}>
          <option value="">All subjects and topics</option>
          {[...s.topics].sort((a, b) => a.name.localeCompare(b.name)).sort((a, b) => depth(a.id) - depth(b.id)).map((t) => <option key={t.id} value={t.id}>{"— ".repeat(depth(t.id))}{t.name}</option>)}
        </select>
        <select aria-label="Type" className={sel} value={f.type ?? ""} onChange={(e) => set({ type: (e.target.value || null) as F["type"] })}>
          <option value="">All types</option><option>MCQ</option><option>MSQ</option><option>NAT</option>
        </select>
        <select aria-label="Marks" className={sel} value={f.marks ?? ""} onChange={(e) => set({ marks: e.target.value ? (Number(e.target.value) as 1 | 2) : null })}>
          <option value="">Any marks</option><option value="1">1 mark</option><option value="2">2 marks</option>
        </select>
        <select aria-label="Attempted" className={sel} value={f.attempted} onChange={(e) => set({ attempted: e.target.value as F["attempted"] })}>
          <option value="any">Attempted or not</option><option value="yes">Attempted</option><option value="no">Not attempted</option>
        </select>
      </form>
      <p className="text-sm text-muted-foreground">{s.total} of {s.corpus} validated question{s.corpus === 1 ? "" : "s"} match.</p>
      {s.rows.length === 0 ? (
        <EmptyState icon={Search} title="No matching questions">Try fewer filters.</EmptyState>
      ) : (
        <div className="surface p-4">
          <div className="mb-3"><PracticeLink ids={ids} variant="default">Practise these {ids.length}</PracticeLink></div>
          <ul className="divide-y divide-border">
            {s.rows.map((r) => (
              <li key={r.id}>
                <PracticeLink ids={ids} id={r.id}>
                  <span className="flex w-full flex-col gap-0.5">
                    <span className="font-medium">{qLabel(r)}{r.attempted ? " · attempted" : ""}</span>
                    <span className="text-xs text-muted-foreground">{[r.subject, r.topic].filter(Boolean).join(" › ")}</span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">{r.snippet}</span>
                  </span>
                </PracticeLink>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-3 flex items-center gap-2">
              <Button variant="outline" disabled={f.page === 0} onClick={() => set({ page: f.page - 1 })}>Previous</Button>
              <span className="text-sm">Page {f.page + 1} of {pages}</span>
              <Button variant="outline" disabled={f.page + 1 >= pages} onClick={() => set({ page: f.page + 1 })}>Next</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
