import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, BookmarkCheck, CalendarPlus, Lock, LogIn } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { getQuestionFlags, markForRevision, setBookmark } from "@/lib/learning.functions";
import type { QuestionMeta } from "@/lib/learning-schema";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/ui";

/** Renders children only for a signed-in account; keyed by uid so no state survives a switch. */
export function SignedIn({ children, what }: { children: (userId: string) => ReactNode; what: string }) {
  const { status, user } = useAuth();
  if (status === "loading") return <div className="surface h-40 animate-pulse" aria-busy="true" aria-label="Loading account" />;
  if (status === "unavailable") return <EmptyState icon={Lock} title="Sign-in is unavailable">Try again later.</EmptyState>;
  if (status !== "signed_in" || !user)
    return (
      <EmptyState icon={LogIn} title={`Sign in to see ${what}`} action={<Button asChild><Link to="/auth">Sign in</Link></Button>}>
        This comes only from your own saved attempts, so it needs your account.
      </EmptyState>
    );
  return <div key={user.id} className="contents">{children(user.id)}</div>;
}

export function Loading({ label }: { label: string }) {
  return <div className="surface h-40 animate-pulse" aria-busy="true" aria-label={label} />;
}

export function LoadFailed({ onRetry, setup }: { onRetry: () => void; setup?: boolean }) {
  return (
    <EmptyState icon={Lock} title={setup ? "Setup is pending" : "Couldn't load this"} action={<Button variant="outline" onClick={onRetry}>Try again</Button>}>
      Nothing is shown rather than guessing.
    </EmptyState>
  );
}

export const qLabel = (q: Pick<QuestionMeta, "year" | "session" | "number" | "type" | "marks">) =>
  `${q.year}${q.session ? ` S${q.session}` : ""} · Q${q.number} · ${q.type} · ${q.marks}m`;

/** Opens the safe practice screen on this question within an ordered sequence. */
export function PracticeLink({ ids, id, children, variant = "ghost" }: { ids: string[]; id?: string; children: ReactNode; variant?: "ghost" | "default" | "outline" }) {
  return (
    <Button variant={variant} asChild className="h-auto min-h-11 justify-start whitespace-normal text-left">
      <Link to="/practice" search={{ ids: ids.join(","), q: id ?? ids[0] }}>{children}</Link>
    </Button>
  );
}

/** Bookmark + mark-for-revision for the signed-in account. */
export function QuestionActions({ userId, questionId }: { userId: string; questionId: string }) {
  const flagsFn = useServerFn(getQuestionFlags);
  const bookmarkFn = useServerFn(setBookmark);
  const markFn = useServerFn(markForRevision);
  const qc = useQueryClient();
  const key = ["learn", userId, "flags", questionId];
  const flags = useQuery({ queryKey: key, queryFn: () => flagsFn({ data: { expectedUserId: userId, questionId } }) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const f = flags.data?.ok ? flags.data : null;
  const run = async (p: Promise<{ ok: boolean }>) => {
    setBusy(true); setErr(false);
    try { if (!(await p).ok) setErr(true); } catch { setErr(true); }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["learn", userId] });
  };
  const due = f?.dueAt ? new Date(f.dueAt) : null;
  return (
    <>
      <Button size="sm" variant="outline" disabled={!f || busy} aria-pressed={!!f?.bookmarked}
        onClick={() => run(bookmarkFn({ data: { expectedUserId: userId, questionId, on: !f?.bookmarked } }))}>
        {f?.bookmarked ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />} {f?.bookmarked ? "Saved" : "Save"}
      </Button>
      <Button size="sm" variant="outline" disabled={!f || busy || (!!due && due <= new Date())}
        onClick={() => run(markFn({ data: { expectedUserId: userId, questionId } }))}>
        <CalendarPlus aria-hidden /> {due ? (due <= new Date() ? "Due for revision" : `Revision ${due.toLocaleDateString()}`) : "Mark for revision"}
      </Button>
      {err && <span role="alert" className="self-center text-xs text-destructive">Couldn't update. Try again.</span>}
    </>
  );
}
