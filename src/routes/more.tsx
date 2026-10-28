import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NAV_GROUPS } from "@/components/app/nav";
import { PageHeader, meta } from "@/components/app/ui";

export const Route = createFileRoute("/more")({
  head: () => meta("More", "All sections of the GATE 2027 ME workspace."),
  component: More,
});

function More() {
  const { status, user } = useAuth();
  const signedIn = status === "signed_in";
  return (
    <>
      <PageHeader title="More" />
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</h2>
          <Link to={signedIn ? "/settings" : "/auth"} className="surface tap flex h-14 items-center gap-3 px-4 hover:bg-accent">
            <UserRound className="size-5 text-primary" aria-hidden />
            <span className="flex-1 truncate font-medium">{signedIn ? (user?.email ?? "Your account") : "Sign in or create account"}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </section>
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
