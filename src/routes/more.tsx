import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { NAV_GROUPS } from "@/components/app/nav";
import { PageHeader, meta } from "@/components/app/ui";

export const Route = createFileRoute("/more")({
  head: () => meta("More", "All sections of the GATE 2027 ME workspace."),
  component: More,
});

function More() {
  return (
    <>
      <PageHeader title="More" />
      <div className="space-y-6">
        {NAV_GROUPS.map((g) => (
          <section key={g.label}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
            <ul className="surface divide-y overflow-hidden">
              {g.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link to={to} className="tap flex h-14 items-center gap-3 px-4 hover:bg-accent">
                    <Icon className="size-5 text-muted-foreground" aria-hidden />
                    <span className="flex-1 font-medium">{label}</span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
