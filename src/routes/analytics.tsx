import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { DataNotice, EmptyState, PageHeader, meta } from "@/components/app/ui";

export const Route = createFileRoute("/analytics")({
  head: () => meta("Analytics", "Accuracy, mastery and evidence counts from your real attempts."),
  component: () => (
    <>
      <PageHeader title="Analytics" description="Mastery with evidence counts — never guesses." />
      <DataNotice />
      <EmptyState icon={BarChart3} title="No attempts recorded">
        Analytics are calculated only from server-checked attempts. There are none yet, so no scores, streaks or forecasts are shown.
      </EmptyState>
    </>
  ),
});
