import { QuestionContent } from "@/components/app/QuestionContent";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpenCheck, Lock, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getPracticeQuestion, listPracticeQuestions, submitPracticeAttempt } from "@/lib/practice.functions";
import type { AttemptSummary, DetailResult, ListResult, PracticeResponse, SubmitError, SubmitInput, SubmitResult } from "@/lib/practice-schema";
import { PracticeAnswerInput } from "@/components/app/PracticeAnswerInput";
import { MathMarkdown } from "@/components/app/MathMarkdown";
import { EmptyState, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";

/** Every call names the account it was issued for; the server rejects a mismatch with the verified token. */
export interface PracticeApi {
  list: (expectedUserId: string) => Promise<ListResult>;
  detail: (expectedUserId: string, questionId: string) => Promise<DetailResult>;
  submit: (expectedUserId: string, input: SubmitInput) => Promise<SubmitResult>;
}

const SUBMIT_MSG: Record<SubmitError | "network", string> = {
  not_available: "This question can't be scored yet (no verified answer key or marking policy). Nothing was saved.",
  invalid_response: "That answer isn't valid for this question. Nothing was saved.",
  conflict: "This submission was already used for a different answer. Submit again to record a new attempt.",
  stale: "This question changed while you were answering. Reload it and try again. Nothing was saved.",
  server_error: "We couldn't confirm your answer was saved. Retry — it won't be counted twice.",
  account_mismatch: "Your account changed before this was sent. Nothing was saved.",
  network: "Couldn't reach the server. Retry — it won't be counted twice.",
};

const fmtMarks = (thirds: number) => {
  const sign = thirds < 0 ? "−" : thirds > 0 ? "+" : "";
  const a = Math.abs(thirds);
  return `${sign}${a % 3 === 0 ? a / 3 : `${a}/3`}`;
};

export function useDefaultPracticeApi(): PracticeApi {
  const list = useServerFn(listPracticeQuestions);
  const detail = useServerFn(getPracticeQuestion);
  const submit = useServerFn(submitPracticeAttempt);
  return {
    list: (expectedUserId) => list({ data: { expectedUserId } }),
    detail: (expectedUserId, questionId) => detail({ data: { expectedUserId, questionId } }),
    submit: (expectedUserId, submission) => submit({ data: { expectedUserId, submission } }),
  };
}

export interface PracticeScope {
  /** Restrict and order the list (daily set, revision queue, filtered PYQ sequence). */
  filterIds?: string[] | undefined;
  /** Daily set the attempts belong to; only passed for questions in that set. */
  assignmentId?: string | null;
  initialId?: string | null;
  /** Per-question account actions (bookmark, mark for revision). */
  extras?: ((questionId: string) => ReactNode) | undefined;
}

export function PracticeSession({ api, ...scope }: { api: PracticeApi } & PracticeScope) {
  const { status, user } = useAuth();
  if (status === "loading") return <div className="surface h-40 animate-pulse" aria-busy="true" aria-label="Loading account" />;
  if (status === "unavailable")
    return <EmptyState icon={Lock} title="Sign-in is unavailable">Scored practice needs a working sign-in. Try again later.</EmptyState>;
  if (status !== "signed_in" || !user)
    return (
      <EmptyState icon={LogIn} title="Sign in for scored practice" action={<Button asChild><Link to="/auth">Sign in</Link></Button>}>
        Answers are checked and saved on the server against your account, so scored practice needs sign-in.
      </EmptyState>
    );
  return <SignedInPractice key={user.id} userId={user.id} api={api} {...scope} />;
}

function SignedInPractice({ userId, api, filterIds, assignmentId = null, initialId = null, extras }: { userId: string; api: PracticeApi } & PracticeScope) {
  const list = useQuery({ queryKey: ["practice", userId, "list"], queryFn: () => api.list(userId) });
  const [selected, setSelected] = useState<string | null>(initialId ?? filterIds?.[0] ?? null);

  if (list.isPending) return <div className="surface h-40 animate-pulse" aria-busy="true" aria-label="Loading questions" />;
  if (list.isError || !list.data.ok)
    return (
      <EmptyState icon={Lock} title={list.data && !list.data.ok && list.data.error === "setup_pending" ? "Practice setup is pending" : "Practice is unavailable"} action={<Button variant="outline" onClick={() => list.refetch()}>Try again</Button>}>
        Questions couldn't be loaded. Nothing is shown rather than guessing.
      </EmptyState>
    );
  const { attempts, questions: all } = list.data;
  const questions = filterIds
    ? filterIds.flatMap((id) => all.filter((q) => q.id === id))
    : all;
  if (questions.length === 0)
    return (
      <EmptyState icon={BookOpenCheck} title="No validated questions yet">
        No questions have been validated and published, so there is nothing to practise. Questions appear here once they pass review with a verified answer key.
      </EmptyState>
    );

  const net = attempts.reduce((s, a) => s + a.marksThirds, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <Panel title={filterIds ? `This set · ${questions.length}` : "Pilot questions"}>
        <p className="mb-3 text-sm text-muted-foreground">
          {attempts.length} saved attempt{attempts.length === 1 ? "" : "s"} · {attempts.filter((a) => a.status === "correct").length} correct · net {fmtMarks(net)} marks
        </p>
        <ul className="space-y-1">
          {questions.map((q) => (
            <li key={q.id}>
              <Button variant={selected === q.id ? "default" : "ghost"} className="h-11 w-full justify-start" onClick={() => setSelected(q.id)}>
                {q.year}{q.session ? ` ${q.session}` : ""} · Q{q.number} · {q.type} · {q.marks}m
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
      {selected ? (
        <QuestionPanel
          key={selected} userId={userId} questionId={selected} api={api} onSaved={() => list.refetch()}
          assignmentId={assignmentId && filterIds?.includes(selected) ? assignmentId : null}
          extras={extras?.(selected)}
          onNext={(() => { const i = questions.findIndex((q) => q.id === selected); const n = questions[i + 1]; return n ? () => setSelected(n.id) : undefined; })()}
        />
      ) : (
        <Panel title="Question"><p className="text-sm text-muted-foreground">Pick a question to start.</p></Panel>
      )}
    </div>
  );
}

function QuestionPanel({ userId, questionId, api, onSaved, assignmentId = null, extras, onNext }: {
  userId: string; questionId: string; api: PracticeApi; onSaved: () => void;
  assignmentId?: string | null; extras?: ReactNode; onNext?: (() => void) | undefined;
}) {
  const detail = useQuery({ queryKey: ["practice", userId, "q", questionId], queryFn: () => api.detail(userId, questionId) });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SubmitError | "network" | null>(null);
  const [result, setResult] = useState<{ attempt: AttemptSummary; solutionMd: string | null } | null>(null);
  const [round, setRound] = useState(0);
  // Unresolved submission: the exact input first sent (ID, duration, answer), resent unchanged
  // on retry until a definite outcome or an explicit new attempt. Never recomputed.
  const [unresolved, setUnresolved] = useState<SubmitInput | null>(null);
  const inFlight = useRef(false);
  const started = useRef(Date.now());
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true; // set in setup so StrictMode's effect replay re-enables completions
    return () => { alive.current = false; };
  }, []);

  if (detail.isPending) return <div className="surface h-60 animate-pulse" aria-busy="true" aria-label="Loading question" />;
  if (detail.isError || !detail.data.ok)
    return <Panel title="Question"><p className="text-sm text-muted-foreground">This question isn't available.</p></Panel>;
  const q = detail.data.question;

  const send = async (input: SubmitInput) => {
    if (inFlight.current) return; // synchronous guard against rapid double clicks
    inFlight.current = true;
    setUnresolved(input);
    setPending(true);
    setError(null);
    let res: SubmitResult | null = null;
    try {
      res = await api.submit(userId, input);
    } catch {
      res = null;
    } finally {
      inFlight.current = false;
    }
    // Panel is keyed by account and question; an unmounted (switched) panel drops the completion.
    if (!alive.current) return;
    setPending(false);
    if (!res) return setError("network");
    if (!res.ok) {
      // Only an unknown outcome keeps the frozen input for a safe retry.
      if (res.error !== "server_error") setUnresolved(null);
      return setError(res.error);
    }
    setUnresolved(null);
    setResult({ attempt: res.attempt, solutionMd: res.solutionMd });
    onSaved();
  };

  const submitNew = (response: PracticeResponse) => {
    if (inFlight.current || unresolved) return;
    const durationSec = Math.min(86400, Math.max(0, Math.round((Date.now() - started.current) / 1000)));
    void send({ submissionId: crypto.randomUUID(), questionId: q.id, expectedRevision: q.revision, assignmentId, durationSec, response });
  };

  const startOver = () => {
    setResult(null);
    setUnresolved(null);
    setError(null);
    setRound((r) => r + 1);
    started.current = Date.now();
  };

  return (
    <Panel title={`${q.year}${q.session ? ` ${q.session}` : ""} · Question ${q.number} · ${q.marks} mark${q.marks === 1 ? "" : "s"}`}>
      {(q.topic || q.sourcePage || q.sourceFile) && (
        <p className="mb-3 text-xs text-muted-foreground">
          {[q.topic, q.sourceFile && `${q.sourceFile}${q.sourcePage ? ` · page ${q.sourcePage}` : ""}`].filter(Boolean).join(" · ")}
        </p>
      )}
      {extras && <div className="mb-3 flex flex-wrap gap-2">{extras}</div>}
      <QuestionContent question={q} />
      {q.options.length > 0 && (
        <ol className="mt-4 space-y-2">
          {q.options.map((o) => (
            <li key={o.id} className="flex gap-2 rounded-xl border border-border p-3 text-sm"><span className="font-semibold">{o.id}.</span><MathMarkdown className="min-w-0 flex-1">{o.bodyMd}</MathMarkdown></li>
          ))}
        </ol>
      )}
      <div className="mt-6">
        {result ? (
          <div role="status" className="space-y-3">
            <p className="text-lg font-semibold">
              {result.attempt.status === "correct" ? "Correct" : result.attempt.status === "wrong" ? "Not correct" : "Left blank"} · {fmtMarks(result.attempt.marksThirds)} marks
            </p>
            <p className="text-xs text-muted-foreground">Saved {new Date(result.attempt.submittedAt).toLocaleString()}</p>
            {result.solutionMd ? (
              <MathMarkdown className="rounded-xl bg-secondary p-4 text-sm">{result.solutionMd}</MathMarkdown>
            ) : (
              <p className="text-sm text-muted-foreground">No reviewed solution is available for this question yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {onNext && <Button onClick={onNext}>Next question</Button>}
              <Button variant="outline" onClick={startOver}>Attempt again</Button>
            </div>
          </div>
        ) : (
          <>
            <PracticeAnswerInput key={round} type={q.type} options={q.options.map((o) => o.id)} disabled={pending || unresolved !== null} onSubmit={submitNew} />
            {pending && <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">Saving…</p>}
            {error && <p role="alert" className="mt-3 text-sm text-destructive">{SUBMIT_MSG[error]}</p>}
            {error === "stale" && !pending && (
              <div className="mt-3">
                <Button variant="outline" onClick={() => { void detail.refetch(); startOver(); }}>Reload question</Button>
              </div>
            )}
            {unresolved && !pending && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void send(unresolved)}>Retry saving</Button>
                <Button variant="ghost" onClick={startOver}>Discard and answer again</Button>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
