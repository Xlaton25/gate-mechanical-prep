import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Info, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, meta } from "@/components/app/ui";
import { PreferencesForm } from "@/components/app/PreferencesForm";
import { useLocalSettings } from "@/lib/local-settings";
import { useAuth } from "@/lib/auth";
import { AccountSettings } from "@/components/app/AccountSettings";

export const Route = createFileRoute("/settings")({
  head: () => meta("Settings", "Study availability, timezone and daily reset time — local or synced to your account."),
  component: Settings,
});

function Settings() {
  const auth = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      {auth.status === "loading" && <p role="status" className="text-sm text-muted-foreground">Checking your session…</p>}
      {auth.status === "signed_in" && auth.user ? (
        <AccountSettings userId={auth.user.id} email={auth.user.email} onSignOut={auth.signOut} />
      ) : auth.status !== "loading" ? (
        <LocalSettings />
      ) : null}
    </>
  );
}

function LocalSettings() {
  const { settings, loaded, save, reset } = useLocalSettings();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <div className="surface mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <UserRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="flex-1 text-sm text-muted-foreground">You're browsing as a guest. Sign in to keep preferences on your account. Settings below are not uploaded when you sign in.</p>
        <Button asChild variant="outline"><Link to="/auth">Sign in</Link></Button>
      </div>
      <div role="note" className="surface mb-6 flex gap-3 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Saved only in this browser on this device. Clearing site data erases these settings.</p>
      </div>
      <Panel title="Study availability (this device)">
        <PreferencesForm
          initial={settings}
          disabled={!loaded}
          submitLabel="Save on this device"
          onDirty={() => setSaved(false)}
          onSubmit={(v) => { save(v); setSaved(true); }}
          status={saved ? "Saved locally." : ""}
          extra={<Button type="button" variant="outline" onClick={() => { reset(); setSaved(false); }}>Reset to defaults</Button>}
        />
      </Panel>
    </>
  );
}
