import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataNotice, EmptyState, PageHeader, meta } from "@/components/app/ui";

export const Route = createFileRoute("/pyq")({
  head: () => meta("PYQ Explorer", "Browse validated GATE ME previous-year questions."),
  component: () => (
    <>
      <PageHeader title="PYQ Explorer" description="Filter previous-year questions by year, subject and concept." />
      <DataNotice />
      <EmptyState
        icon={Search}
        title="Full archive search is still pending"
        action={<Button variant="outline" asChild><Link to="/practice">Open pilot practice</Link></Button>}
      >
        A ten-question ME2026 pilot is validated and ready now. Year, subject and concept filters over the rest of the
        26-paper archive have not been built yet.
      </EmptyState>
    </>
  ),
});
