import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/local-settings";
import { MOBILE_NAV, NAV_GROUPS } from "./nav";

const linkBase =
  "tap flex items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
const linkActive = "bg-accent text-accent-foreground";

export function AppShell({ children }: { children: ReactNode }) {
  const { dark, toggle } = useTheme();
  return (
    <div className="min-h-screen bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center justify-between px-5">
          <Link to="/" className="rounded-lg text-base font-semibold tracking-tight">
            GATE 2027 <span className="text-primary">ME</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              <ul className="space-y-1">
                {g.items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <Link to={to} className={linkBase} activeProps={{ className: linkActive }} activeOptions={{ exact: true }}>
                      <Icon className="size-4" aria-hidden /> {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
        <Link to="/" className="font-semibold tracking-tight">GATE 2027 <span className="text-primary">ME</span></Link>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
          {dark ? <Sun /> : <Moon />}
        </Button>
      </header>

      <main id="main" className="pb-28 lg:pb-12 lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">{children}</div>
      </main>

      <nav aria-label="Primary mobile" className="fixed inset-x-0 bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact: true }}
                className="tap flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
                activeProps={{ className: "text-primary" }}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
