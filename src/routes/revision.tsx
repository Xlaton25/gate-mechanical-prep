import { createFileRoute } from "@tanstack/react-router";
import { FunctionSquare, ListRestart, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, meta } from "@/components/app/ui";

export const Route = createFileRoute("/revision")({
  head: () => meta("Revision", "Spaced revision queue, mistake log and formula cards."),
  component: Revision,
});

function Revision() {
  return (
    <>
      <PageHeader title="Revision" description="Spaced repetition from your own attempts." />
      <Tabs defaultValue="queue">
        <TabsList className="mb-4 h-12 rounded-xl">
          <TabsTrigger value="queue" className="h-10 rounded-lg px-4">Queue</TabsTrigger>
          <TabsTrigger value="mistakes" className="h-10 rounded-lg px-4">Mistakes</TabsTrigger>
          <TabsTrigger value="formulas" className="h-10 rounded-lg px-4">Formulas</TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <EmptyState icon={ListRestart} title="Queue is empty">Questions are scheduled here after you attempt them in Daily Practice.</EmptyState>
        </TabsContent>
        <TabsContent value="mistakes">
          <EmptyState icon={XCircle} title="No mistakes logged">Incorrect answers, checked against a verified key, will be collected here.</EmptyState>
        </TabsContent>
        <TabsContent value="formulas">
          <EmptyState icon={FunctionSquare} title="No formula cards">Formula cards will be linked to concepts once the Learning Hub has validated content.</EmptyState>
        </TabsContent>
      </Tabs>
    </>
  );
}
