import { createFileRoute } from "@tanstack/react-router";
import { Timer } from "lucide-react";
import { DataNotice, EmptyState, PageHeader, meta } from "@/components/app/ui";

export const Route = createFileRoute("/mocks")({
  head: () => meta("Mock Tests", "Timed GATE ME mock tests built from validated questions."),
  component: () => (
    <>
      <PageHeader title="Mock Tests" description="Full-length, timed, GATE-format tests." />
      <DataNotice />
      <EmptyState icon={Timer} title="No mock tests available">
        Mocks need a validated question bank and verified keys. They are not available yet.
      </EmptyState>
    </>
  ),
});
