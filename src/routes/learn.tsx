import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { DataNotice, EmptyState, PageHeader, meta } from "@/components/app/ui";

export const Route = createFileRoute("/learn")({
  head: () => meta("Learning Hub", "Concepts and formulas linked to validated GATE ME questions."),
  component: () => (
    <>
      <PageHeader title="Learning Hub" description="Concepts, linked to the questions that test them." />
      <DataNotice />
      <EmptyState icon={BookOpen} title="No concepts yet">
        Concept pages will be built from validated questions so every topic links back to real evidence.
      </EmptyState>
    </>
  ),
});
