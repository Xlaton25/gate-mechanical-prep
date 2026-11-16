import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { meta } from "@/components/app/ui";
import { supabaseAuthClient, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin-login")({
  head: () => {
    const m = meta("Admin sign in", "Restricted sign-in for GATE 2027 ME data administrators.");
    return { ...m, meta: [...(m.meta ?? []), { name: "robots", content: "noindex, nofollow" }] };
  },
  component: AdminLogin,
});

function AdminLogin() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.status === "signed_in") navigate({ to: "/admin", replace: true });
  }, [auth.status, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await supabaseAuthClient.signIn(email, password);
    setBusy(false);
    if (r.error) setError(r.error);
  }

  return (
    <div className="mx-auto max-w-sm py-6 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Admin sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Restricted area. Only approved admin accounts get access.</p>
      <form onSubmit={submit} className="surface mt-6 grid gap-4 p-6">
        <div className="grid gap-2">
          <Label htmlFor="admin-email">Email</Label>
          <Input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-password">Password</Label>
          <Input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11" disabled={busy || auth.status === "loading"}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
    </div>
  );
}
