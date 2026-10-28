import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, meta } from "@/components/app/ui";
import { PracticeSession, useDefaultPracticeApi } from "@/components/app/PracticeSession";

export const Route = createFileRoute("/practice")({
  head: () => meta("Pilot Practice", "Pilot practice on validated GATE ME questions, checked and saved on the server."),
  component: Practice,
});

function Practice() {
  const api = useDefaultPracticeApi();
  return (
    <>
      <PageHeader title="Pilot Practice" description="Validated questions only, checked on the server and saved to your account." />
      <div role="note" className="mb-6 rounded-2xl border border-border bg-secondary p-4 text-sm text-secondary-foreground">
        This is pilot practice, not the scheduled daily 10 — the daily engine isn't built yet. Scores and progress come only from your saved attempts.
      </div>
      <PracticeSession api={api} />
    </>
  );
}
