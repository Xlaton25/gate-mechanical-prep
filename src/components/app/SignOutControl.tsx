import { Button } from "@/components/ui/button";

/** Sign-out button with pending state and inline retryable error. */
export function SignOutControl({ onSignOut, pending, error }: { onSignOut: () => unknown; pending?: boolean | undefined; error?: string | null | undefined }) {
  return (
    <div className="grid gap-2">
      <Button variant="outline" onClick={() => { if (!pending) void onSignOut(); }} disabled={pending}>
        {pending ? "Signing out…" : error ? "Try signing out again" : "Sign out"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
