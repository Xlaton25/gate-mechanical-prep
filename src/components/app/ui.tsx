import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 rounded-2xl bg-secondary p-3 text-secondary-foreground"><Icon className="size-6" aria-hidden /></div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 max-w-md text-sm text-muted-foreground">{children}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function DataNotice({ children }: { children?: ReactNode }) {
  return (
    <div role="note" className="mb-6 flex gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        {children ?? "All learning data is currently unverified and unimported. No questions have been validated yet, so scores, progress and analytics are not available."}
      </p>
    </div>
  );
}

export function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`surface p-5 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function meta(title: string, description: string) {
  const t = `${title} · GATE 2027 ME`;
  return {
    meta: [
      { title: t },
      { name: "description", content: description },
      { property: "og:title", content: t },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  };
}
