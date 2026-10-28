import { useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignOutControl } from "@/components/app/SignOutControl";
import { Panel } from "@/components/app/ui";
import { PreferencesForm } from "@/components/app/PreferencesForm";
import { useAccountPreferences } from "@/lib/use-account-preferences";
import { supabasePreferencesStore } from "@/lib/preferences-store";
import type { PreferencesStore } from "@/lib/preferences";

export function AccountSettings({ userId, email, onSignOut, signOutPending, signOutError, store }: { userId: string; email: string | null; onSignOut: () => unknown; signOutPending?: boolean; signOutError?: string | null; store?: PreferencesStore }) {
  const s = useMemo(() => store ?? supabasePreferencesStore(), [store]);
  const { state, save, reload } = useAccountPreferences(userId, s);
  const [dirty, setDirty] = useState(false);

  return (
    <>
      <div className="surface mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        <UserRound className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 text-sm">Signed in as <span className="font-medium">{email ?? "your account"}</span>. Preferences below are saved to your account.</p>
        <SignOutControl onSignOut={onSignOut} pending={signOutPending} error={signOutError} />
      </div>
      <Panel title="Study availability (account)">
        {(state.status === "loading" || state.status === "idle") && <p role="status" className="text-sm text-muted-foreground">Loading your preferences…</p>}
        {state.status === "error" && (
          <div role="alert" className="grid gap-3 text-sm">
            <p className="text-destructive">{state.failure.message}</p>
            {state.failure.reason === "setup_pending" && <p className="text-muted-foreground">The database tables for this app haven't been applied yet. Nothing was saved.</p>}
            <div><Button variant="outline" onClick={reload}>Try again</Button></div>
          </div>
        )}
        {state.status === "ready" && (
          <>
            {!state.exists && <p className="mb-4 text-sm text-muted-foreground">No saved preferences yet — showing defaults. Nothing is stored until you save.</p>}
            <PreferencesForm
              initial={state.prefs}
              busy={state.saving}
              submitLabel="Save to account"
              onDirty={() => setDirty(true)}
              onSubmit={(v) => { setDirty(false); void save(v); }}
              status={state.saveError ? <span className="text-destructive">{state.saveError.message}</span> : state.savedAt && !dirty ? "Saved to your account." : ""}
            />
          </>
        )}
      </Panel>
    </>
  );
}
