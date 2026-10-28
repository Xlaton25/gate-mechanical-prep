import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpenCheck, Lock, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getPracticeQuestion, listPracticeQuestions, submitPracticeAttempt } from "@/lib/practice.functions";
import type { AttemptSummary, DetailResult, ListResult, PracticeResponse, SubmitError, SubmitInput, SubmitResult } from "@/lib/practice-schema";
import { PracticeAnswerInput } from "@/components/app/PracticeAnswerInput";
import { EmptyState, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";

export interface PracticeApi {
  list: () => Promise<ListResult>;
  detail: (questionId: string) => Promise<DetailResult>;
  submit: (input: SubmitInput) => Promise<SubmitResult>;
}

const SUBMIT_MSG: Record<SubmitError | "network", string> = {
  not_available: "This question can't be scored yet (no verified answer key or marking policy). Nothing was saved.",
  invalid_response: "That answer isn't valid for this question. Nothing was saved.",
  conflict: "This submission was already used for a different answer. Submit again to record a new attempt.",
  stale: "This question changed while you were answering. Reload it and try again. Nothing was saved.",
  server_error: "We couldn't save your answer. Try again — your retry won't be counted twice.",
  network: "Couldn't reach the server. Try again — your retry won't be counted twice.",
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
    list: () => list(),
    detail: (questionId) => detail({ data: { questionId } }),
    submit: (input) => submit({ data: input }),
  };
}

export function PracticeSession({ api }: { api: PracticeApi }) {
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
  return <SignedInPractice key={user.id} userId={user.id} api={api} />;
}

function SignedInPractice({ userId, api }: { userId: string; api: PracticeApi }) {
  const list = useQuery({ queryKey: ["practice", userId, "list"], queryFn: api.list });
  const [selected, setSelected] = useState<string | null>(null);

  if (list.isPending) return <div className="surface h-40 animate-pulse" aria-busy="true" aria-label="Loading questions" />;
  if (list.isError || !list.data.ok)
    return (
      <EmptyState icon={Lock} title={list.data && !list.data.ok && list.data.error === "setup_pending" ? "Practice setup is pending" : "Practice is unavailable"} action={<Button variant="outline" onClick={() => list.refetch()}>Try again</Button>}>
        Questions couldn't be loaded. Nothing is shown rather than guessing.
      </EmptyState>
    );
  const { questions, attempts } = list.data;
  if (questions.length === 0)
    return (
      <EmptyState icon={BookOpenCheck} title="No validated questions yet">
        No questions have been validated and published, so there is nothing to practise. Questions appear here once they pass review with a verified answer key.
      </EmptyState>
    );

  const net = attempts.reduce((s, a) => s + a.marksThirds, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <Panel title="Pilot questions">
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
        <QuestionPanel key={selected} userId={userId} questionId={selected} api={api} onSaved={() => list.refetch()} />
      ) : (
        <Panel title="Question"><p className="text-sm text-muted-foreground">Pick a question to start.</p></Panel>
      )}
    </div>
  );
}

function QuestionPanel({ userId, questionId, api, onSaved }: { userId: string; questionId: string; api: PracticeApi; onSaved: () => void }) {
  const detail = useQuery({ queryKey: ["practice", userId, "q", questionId], queryFn: () => api.detail(questionId) });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ attempt: AttemptSummary; solutionMd: string | null } | null>(null);
  const [round, setRound] = useState(0);
  const submission = useRef<{ id: string; payload: string } | null>(null);
  const started = useRef(Date.now());
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  if (detail.isPending) return <div className="surface h-60 animate-pulse" aria-busy="true" aria-label="Loading question" />;
  if (detail.isError || !detail.data.ok)
    return <Panel title="Question"><p className="text-sm text-muted-foreground">This question isn't available.</p></Panel>;
  const q = detail.data.question;

  const submit = async (response: PracticeResponse) => {
    const payload = JSON.stringify(response);
    // Retries of the same answer reuse the submission ID so the server records it once.
    if (!submission.current || submission.current.payload !== payload) submission.current = { id: crypto.randomUUID(), payload };
    const durationSec = Math.min(86400, Math.round((Date.now() - started.current) / 1000));
    setPending(true);
    setError(null);
    let res: SubmitResult | null = null;
    try {
      res = await api.submit({ submissionId: submission.current.id, questionId: q.id, assignmentId: null, durationSec, response });
    } catch {
      res = null;
    }
    // Panel is keyed by account and question; an unmounted (switched) panel drops the completion.
    if (!alive.current) return;
    setPending(false);
    if (!res) return setError(SUBMIT_MSG.network);
    if (!res.ok) {
      if (res.error === "conflict") submission.current = null;
      return setError(SUBMIT_MSG[res.error]);
    }
    submission.current = null;
    setResult({ attempt: res.attempt, solutionMd: res.solutionMd });
    onSaved();
  };

  return (
    <Panel title={`${q.year}${q.session ? ` ${q.session}` : ""} · Question ${q.number} · ${q.marks} mark${q.marks === 1 ? "" : "s"}`}>
      <div className="font-math whitespace-pre-wrap text-base leading-relaxed">{q.bodyMd}</div>
      {q.options.length > 0 && (
        <ol className="mt-4 space-y-2">
          {q.options.map((o) => (
            <li key={o.id} className="rounded-xl border border-border p-3 text-sm"><span className="font-semibold">{o.id}.</span> <span className="whitespace-pre-wrap">{o.bodyMd}</span></li>
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
              <div className="rounded-xl bg-secondary p-4 text-sm whitespace-pre-wrap">{result.solutionMd}</div>
            ) : (
              <p className="text-sm text-muted-foreground">No reviewed solution is available for this question yet.</p>
            )}
            <Button variant="outline" onClick={() => { setResult(null); setRound((r) => r + 1); started.current = Date.now(); }}>Attempt again</Button>
          </div>
        ) : (
          <>
            <PracticeAnswerInput key={round} type={q.type} options={q.options.map((o) => o.id)} disabled={pending} onSubmit={submit} />
            {pending && <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">Saving…</p>}
            {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          </>
        )}
      </div>
    </Panel>
  );
}
