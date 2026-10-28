import { useState } from "react";
import { MailCheck } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthClient } from "@/lib/auth";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
});

type Mode = "signin" | "signup";

export function AuthForm({ client, onSignedIn }: { client: AuthClient; onSignedIn?: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  if (confirmFor) {
    return (
      <div role="status" className="text-center">
        <div className="mx-auto mb-4 w-fit rounded-2xl bg-secondary p-3 text-secondary-foreground"><MailCheck className="size-6" aria-hidden /></div>
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="mt-2 text-sm text-muted-foreground">We sent a confirmation link to <span className="font-medium text-foreground">{confirmFor}</span>. Open it to finish creating your account, then sign in.</p>
        <Button variant="outline" className="mt-5" onClick={() => { setConfirmFor(null); setMode("signin"); setPassword(""); }}>Back to sign in</Button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const v = schema.safeParse({ email, password });
    if (!v.success) { setError(v.error.issues[0]?.message ?? "Check your details."); return; }
    setPending(true);
    setError(null);
    if (mode === "signin") {
      const r = await client.signIn(v.data.email, v.data.password);
      setPending(false);
      if (r.error) { setError(r.error); return; }
      setPassword("");
      onSignedIn?.();
    } else {
      const r = await client.signUp(v.data.email, v.data.password);
      setPending(false);
      if (r.error) { setError(r.error); return; }
      setPassword("");
      if (r.needsConfirmation) setConfirmFor(v.data.email);
      else onSignedIn?.();
    }
  };

  return (
    <div>
      <div role="tablist" aria-label="Account" className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setError(null); }}
            className={`tap rounded-lg text-sm font-medium transition-colors ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-2">
          <Label htmlFor="auth-email">Email</Label>
          <Input id="auth-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-xl"
            aria-describedby={mode === "signup" ? "auth-password-hint" : undefined}
            required
          />
          {mode === "signup" && <p id="auth-password-hint" className="text-xs text-muted-foreground">At least 8 characters.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? (mode === "signin" ? "Signing in…" : "Creating account…") : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
