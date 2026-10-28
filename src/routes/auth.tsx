import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AuthForm } from "@/components/app/AuthForm";
import { meta } from "@/components/app/ui";
import { supabaseAuthClient, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => meta("Sign in", "Sign in or create an account to sync your GATE 2027 ME study preferences."),
  component: AuthPage,
});

function AuthPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-md py-4 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your account</h1>
      <p className="mt-1 text-muted-foreground">Optional. Signing in syncs your study preferences. You can browse everything without an account.</p>
      <div className="surface mt-6 p-6">
        {auth.status === "loading" && <p role="status" className="text-sm text-muted-foreground">Checking your session…</p>}
        {auth.status === "unavailable" && <p role="alert" className="text-sm text-destructive">Sign-in is unavailable right now. Try again later.</p>}
        {auth.status === "signed_in" && (
          <div className="grid gap-4">
            <p>Signed in as <span className="font-medium">{auth.user?.email ?? "your account"}</span>.</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild><Link to="/settings">Go to settings</Link></Button>
              <Button variant="outline" onClick={() => auth.signOut()}>Sign out</Button>
            </div>
          </div>
        )}
        {auth.status === "signed_out" && <AuthForm client={supabaseAuthClient} onSignedIn={() => navigate({ to: "/settings" })} />}
      </div>
    </div>
  );
}
