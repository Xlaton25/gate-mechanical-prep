import { QuestionContent } from "@/components/app/QuestionContent";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataNotice, EmptyState, PageHeader, Panel, meta } from "@/components/app/ui";
import { LoadFailed, Loading, SignedIn } from "@/components/app/learning";
import { MathMarkdown } from "@/components/app/MathMarkdown";
import { PracticeAnswerInput } from "@/components/app/PracticeAnswerInput";
import { finalizeMiniTest, getMiniTest, saveMiniDraft, startMiniTest } from "@/lib/learning.functions";
import type { MiniTestView } from "@/lib/learning-schema";
import type { PracticeResponse } from "@/lib/practice-schema";
import { fmtThirds } from "@/lib/progress";

export const Route = createFileRoute("/mocks")({
  head: () => meta("Mini-tests", "Timed mini-tests from validated GATE ME questions, scored on the server."),
  component: () => (
    <>
      <PageHeader title="Mini-tests" description="Short timed tests. Not a full GATE mock — full-length mode needs far more validated questions." />
      <DataNotice>Built from the partial 10-question ME2026 pilot. Answers and solutions appear only after you submit the test.</DataNotice>
      <SignedIn what="mini-tests">{(uid) => <MiniTests userId={uid} />}</SignedIn>
    </>
  ),
});

const sel = "h-11 rounded-xl border border-input bg-background px-3 text-sm";

function MiniTests({ userId }: { userId: string }) {
  const getFn = useServerFn(getMiniTest);
  const startFn = useServerFn(startMiniTest);
  const qc = useQueryClient();
  const key = ["learn", userId, "minitest"];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { expectedUserId: userId } }) });
  const [topicId, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [finished, setFinished] = useState<MiniTestView | null>(null);
  if (q.isPending) return <Loading label="Loading mini-test" />;
  if (q.isError || !q.data.ok) return <LoadFailed onRetry={() => q.refetch()} setup={q.data && !q.data.ok && q.data.error === "setup_pending"} />;
  const { test, pool, topics } = q.data;
  if (finished) return <Results test={finished} onDone={() => setFinished(null)} />;
  if (test) return <Running userId={userId} test={test} onFinished={(t) => { setFinished(t); void qc.invalidateQueries({ queryKey: ["learn", userId] }); }} />;
  if (pool.length === 0) return <EmptyState icon={Timer} title="No eligible questions">Mini-tests need validated questions with verified keys.</EmptyState>;
  const used = topics.filter((t) => pool.some((p) => { for (let c = topics.find((x) => x.id === p.topicId), i = 0; c && i < 20; c = topics.find((x) => x.id === c!.parentId), i++) if (c.id === t.id) return true; return false; }));
  const start = async () => {
    setBusy(true); setErr(false);
    const r = await startFn({ data: { expectedUserId: userId, topicId: topicId || null, count, minutes } }).catch(() => null);
    setBusy(false);
    if (!r?.ok || !r.test) return setErr(true);
    void q.refetch();
  };
  return (
    <Panel title="New mini-test">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">Scope
          <select className={sel} value={topicId} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Mixed (all {pool.length})</option>
            {used.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Questions (max {Math.min(10, pool.length)})
          <input className={sel} type="number" min={1} max={Math.min(10, pool.length)} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, pool.length, Number(e.target.value) || 1)))} />
        </label>
        <label className="grid gap-1 text-sm">Minutes (5–180)
          <input className={sel} type="number" min={5} max={180} value={minutes} onChange={(e) => setMinutes(Math.max(5, Math.min(180, Number(e.target.value) || 5)))} />
        </label>
      </div>
      <Button className="mt-4" disabled={busy} onClick={() => void start()}><Timer aria-hidden /> Start mini-test</Button>
      {err && <p role="alert" className="mt-2 text-sm text-destructive">Couldn't start. Try again.</p>}
    </Panel>
  );
}

function Running({ userId, test, onFinished }: { userId: string; test: MiniTestView; onFinished: (t: MiniTestView) => void }) {
  const draftFn = useServerFn(saveMiniDraft);
  const finFn = useServerFn(finalizeMiniTest);
  // Remaining time from the SERVER clock, so reload resumes correctly regardless of device time.
  const skew = useRef(Date.parse(test.serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.now() + skew.current);
  const [drafts, setDrafts] = useState<Record<string, PracticeResponse | null>>(() => Object.fromEntries(test.items.map((i) => [i.question?.id ?? String(i.position), i.draft])));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fin = useRef(false);
  const left = Math.max(0, Math.floor((Date.parse(test.deadlineAt) - now) / 1000));
  const finish = async () => {
    if (fin.current) return;
    fin.current = true; setBusy(true); setMsg(null);
    const r = await finFn({ data: { expectedUserId: userId, testId: test.id } }).catch(() => null);
    fin.current = false; setBusy(false);
    if (r?.ok && r.test?.result) return onFinished(r.test);
    setMsg("Couldn't confirm the result. Retry — answers won't be counted twice.");
  };
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + skew.current), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (left === 0) void finish(); }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (qid: string, r: PracticeResponse) => {
    const res = await draftFn({ data: { expectedUserId: userId, testId: test.id, questionId: qid, response: r } }).catch(() => null);
    if (res?.ok && res.outcome === "saved") { setDrafts((d) => ({ ...d, [qid]: r })); setMsg(null); }
    else setMsg(res?.ok && res.outcome === "deadline" ? "Time is up — this answer wasn't saved." : "Couldn't save that answer. Try again.");
  };
  const anyStale = test.items.some((i) => i.stale);
  return (
    <div className="space-y-4">
      <div className="surface sticky top-2 z-10 flex items-center gap-3 p-4">
        <Timer aria-hidden className="size-5" />
        <span className="text-lg font-semibold tabular-nums" aria-live="off">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
        <span className="text-sm text-muted-foreground">{Object.values(drafts).filter(Boolean).length}/{test.items.length} answered</span>
        <Button className="ml-auto" disabled={busy} onClick={() => void finish()}>{busy ? "Submitting…" : "Submit test"}</Button>
      </div>
      {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
      {anyStale && <p role="alert" className="rounded-xl bg-secondary p-3 text-sm">A question changed after this test started. It won't be graded on old wording; submit and start a new test.</p>}
      {test.items.map((i) => i.question && !i.stale ? (
        <Panel key={i.position} title={`Question ${i.position} · ${i.question.type} · ${i.question.marks}m`}>
          <QuestionContent question={i.question} />
          {i.question.options.length > 0 && (
            <ol className="mt-4 space-y-2">
              {i.question.options.map((o) => <li key={o.id} className="flex gap-2 rounded-xl border border-border p-3 text-sm"><span className="font-semibold">{o.id}.</span><MathMarkdown className="min-w-0 flex-1">{o.bodyMd}</MathMarkdown></li>)}
            </ol>
          )}
          <div className="mt-4">
            <PracticeAnswerInput type={i.question.type} options={i.question.options.map((o) => o.id)} disabled={left === 0} submitLabel={drafts[i.question.id] ? "Update answer" : "Save answer"}
              initial={draftInit(drafts[i.question.id])} onSubmit={(r) => void save(i.question!.id, r)} />
            {drafts[i.question.id] && <p className="mt-2 text-xs text-muted-foreground">Answer saved (not checked until you submit).</p>}
          </div>
        </Panel>
      ) : (
        <Panel key={i.position} title={`Question ${i.position}`}><p className="text-sm text-muted-foreground">This question changed or is no longer available; it won't be graded.</p></Panel>
      ))}
    </div>
  );
}

const draftInit = (d: PracticeResponse | null | undefined) =>
  !d ? undefined : d.kind === "MCQ" ? { options: [d.option] } : d.kind === "MSQ" ? { options: d.options } : d.kind === "NAT" ? { value: d.value } : undefined;

function Results({ test, onDone }: { test: MiniTestView; onDone: () => void }) {
  const r = test.result!;
  return (
    <div className="space-y-4">
      <Panel title="Mini-test result">
        <p className="text-2xl font-semibold">{fmtThirds(r.netThirds)} marks</p>
        <p className="text-sm text-muted-foreground">{r.correct} correct · {r.wrong} wrong · {r.blank} blank{r.stale ? ` · ${r.stale} not graded (content changed)` : ""}{r.invalid ? ` · ${r.invalid} invalid` : ""} · {Math.round(r.timeSec / 60)} min</p>
        <Button className="mt-3" variant="outline" onClick={onDone}>New mini-test</Button>
      </Panel>
      {r.items.map((it) => {
        const q = test.items.find((x) => x.position === it.position)?.question;
        return (
          <Panel key={it.position} title={`Question ${it.position} · ${it.status === "unanswered" ? "blank" : it.status} · ${fmtThirds(it.marksThirds)}`}>
            {q && <QuestionContent question={q} />}
            {it.solutionMd ? <MathMarkdown className="mt-3 rounded-xl bg-secondary p-4 text-sm">{it.solutionMd}</MathMarkdown> : <p className="mt-2 text-xs text-muted-foreground">No reviewed solution available.</p>}
          </Panel>
        );
      })}
    </div>
  );
}
