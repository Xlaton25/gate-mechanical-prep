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
      <EmptyState icon={Search} title="No questions imported" action={<Button variant="outline" asChild><Link to="/admin">See source files</Link></Button>}>
        26 source PDFs are received, but no questions have been extracted or validated.
      </EmptyState>
    </>
  ),
});
