import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, meta } from "@/components/app/ui";
import { PracticeSession, useDefaultPracticeApi } from "@/components/app/PracticeSession";
import { QuestionActions } from "@/components/app/learning";
import { useAuth } from "@/lib/auth";

const UUID = /^[0-9a-f-]{36}$/i;
type Search = { ids?: string; q?: string; set?: string };

export const Route = createFileRoute("/practice")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ids: typeof s.ids === "string" ? s.ids : undefined,
    q: typeof s.q === "string" && UUID.test(s.q) ? s.q : undefined,
    set: typeof s.set === "string" && UUID.test(s.set) ? s.set : undefined,
  }),
  head: () => meta("Practice", "Practice validated GATE ME questions, checked and saved on the server."),
  component: Practice,
});

function Practice() {
  const api = useDefaultPracticeApi();
  const { user } = useAuth();
  const { ids, q, set } = Route.useSearch();
  const filterIds = ids ? ids.split(",").filter((x) => UUID.test(x)).slice(0, 100) : undefined;
  return (
    <>
      <PageHeader title={set ? "Today's set" : "Practice"} description="Validated questions only, checked on the server and saved to your account." />
      <div role="note" className="mb-6 rounded-2xl border border-border bg-secondary p-4 text-sm text-secondary-foreground">
        Current question bank: a partial 10-question ME2026 pilot. Scores and progress come only from your saved attempts.
      </div>
      <PracticeSession
        key={`${ids ?? ""}|${set ?? ""}`}
        api={api}
        filterIds={filterIds}
        assignmentId={set ?? null}
        initialId={q ?? null}
        extras={user ? (qid) => <QuestionActions userId={user.id} questionId={qid} /> : undefined}
      />
    </>
  );
}
