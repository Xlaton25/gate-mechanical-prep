import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileSearch } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel, meta } from "@/components/app/ui";
import { INTAKE_SUMMARY, SOURCE_FILES, STATUS_LABEL, searchSources, totalPages } from "@/data/source-inventory";
import type { SourceStatus } from "@/domain/types";

export const Route = createFileRoute("/admin")({
  head: () => meta("Data Administration", "Source file registry for the GATE ME PYQ intake."),
  component: Admin,
});

const statusClass: Record<SourceStatus, string> = {
  received: "bg-muted text-muted-foreground",
  sampled: "bg-secondary text-secondary-foreground",
  needs_ocr: "bg-warning-soft text-warning-foreground",
  needs_review: "bg-warning-soft text-warning-foreground",
};

function Admin() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SourceStatus | "all">("all");
  const rows = useMemo(() => searchSources(q, status), [q, status]);

  return (
    <>
      <PageHeader title="Data Administration" description="Registry of received source files. Metadata only — PDFs are not stored or served by this app." />
      <Panel title="Intake summary" className="mb-6">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          <li>Archive: {INTAKE_SUMMARY.archive} — ZIP integrity {INTAKE_SUMMARY.zipIntegrity}</li>
          <li>{SOURCE_FILES.length} PDFs · {totalPages()} pages</li>
          <li>Byte-identical duplicates: {INTAKE_SUMMARY.byteIdenticalDuplicates}</li>
          <li>Verified questions: {INTAKE_SUMMARY.verifiedQuestions}</li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Not complete session or question coverage. {INTAKE_SUMMARY.note}</p>
      </Panel>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input type="search" placeholder="Search file name, year or status" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 rounded-xl" aria-label="Search sources" />
        <select value={status} onChange={(e) => setStatus(e.target.value as SourceStatus | "all")} aria-label="Filter by status" className="h-11 rounded-xl border border-input bg-card px-3 text-sm sm:w-48">
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABEL) as SourceStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <p className="mb-3 text-sm text-muted-foreground" role="status">{rows.length} of {SOURCE_FILES.length} files</p>

      {rows.length === 0 ? (
        <EmptyState icon={FileSearch} title="No matching files">Try a different search or status.</EmptyState>
      ) : (
        <ul className="surface divide-y overflow-hidden">
          {rows.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex-1">
                <p className="font-mono text-sm font-medium">{f.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  Filename year {f.filenameYear}{f.filenameSession ? ` · session ${f.filenameSession}` : ""} · {f.pageCount} pages
                </p>
                {f.notes.map((n) => <p key={n} className="mt-1 text-xs text-muted-foreground">{n}</p>)}
              </div>
              <span className={`self-start rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[f.status]}`}>{STATUS_LABEL[f.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
