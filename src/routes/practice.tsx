import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { DataNotice, EmptyState, PageHeader, Panel, meta } from "@/components/app/ui";
import { PracticeAnswerInput } from "@/components/app/PracticeAnswerInput";

export const Route = createFileRoute("/practice")({
  head: () => meta("Daily Practice", "Daily 10-question practice from validated GATE ME PYQs."),
  component: Practice,
});

function Practice() {
  return (
    <>
      <PageHeader title="Daily Practice" description="10 validated questions a day, checked on the server." />
      <DataNotice />
      <EmptyState icon={Lock} title="Scored practice is disabled">
        No questions are validated and no answer keys are verified. Practice will unlock when both exist and answers are checked server-side — never in your browser.
      </EmptyState>
      <Panel title="Answer input preview (no question loaded)" className="mt-6">
        <PracticeAnswerInput type="MCQ" disabled onSubmit={() => {}} />
      </Panel>
    </>
  );
}
