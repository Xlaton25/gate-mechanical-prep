import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AuthStatus = "loading" | "signed_out" | "signed_in" | "unavailable";
export interface AuthUser { id: string; email: string | null }
export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Resolves true only when the provider confirmed sign-out. */
  signOut: () => Promise<boolean>;
  signOutPending: boolean;
  signOutError: string | null;
}

const AuthContext = createContext<AuthState>({ status: "loading", user: null, signOut: async () => false, signOutPending: false, signOutError: null });

/** Port used by the sign-in form; swapped for a fake in tests. Never logs credentials. */
export interface AuthClient {
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signUp(email: string, password: string): Promise<{ error: string | null; needsConfirmation: boolean }>;
}

function friendly(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login")) return "Email or password is incorrect.";
  if (m.includes("not confirmed")) return "Confirm your email first — check your inbox for the link.";
  if (m.includes("already registered")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("password")) return "Password doesn't meet the requirements (at least 8 characters).";
  if (m.includes("rate")) return "Too many attempts. Wait a minute and try again.";
  return "Something went wrong. Please try again.";
}

export const supabaseAuthClient: AuthClient = {
  async signIn(email, password) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? friendly(error.message) : null };
    } catch {
      return { error: "Couldn't reach the sign-in service." };
    }
  },
  async signUp(email, password) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (error) return { error: friendly(error.message), needsConfirmation: false };
      return { error: null, needsConfirmation: !data.session };
    } catch {
      return { error: "Couldn't reach the sign-up service.", needsConfirmation: false };
    }
  },
};

function toUser(u: { id: string; email?: string | null } | null | undefined): AuthUser | null {
  return u ? { id: u.id, email: u.email ?? null } : null;
}

type SessionLike = { user?: { id: string; email?: string | null } | null } | null;

/** Narrow port over supabase.auth used by AuthProvider; replaced by a fake in tests. */
export interface SessionSource {
  onAuthStateChange(cb: (event: string, session: SessionLike) => void): { data: { subscription: { unsubscribe(): void } } };
  getSession(): Promise<{ data: { session: SessionLike }; error?: unknown }>;
  signOut(): Promise<{ error: unknown }>;
}

const SIGN_OUT_FAILED = "Couldn't sign out. You're still signed in — check your connection and try again.";

export function AuthProvider({ children, source }: { children: ReactNode; source?: SessionSource }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ status: AuthStatus; user: AuthUser | null }>({ status: "loading", user: null });
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  // Bumped by every auth event; bootstrap results tagged with an older value are dropped.
  const generation = useRef(0);
  const currentUid = useRef<string | null | undefined>(undefined); // undefined = not yet known
  const signingOut = useRef(false);
  // Resolved only inside the effect (never during render/SSR) so an unconfigured client can't crash the shell.
  const authRef = useRef<SessionSource | null>(null);

  const apply = useCallback((user: AuthUser | null, status?: AuthStatus) => {
    const prev = currentUid.current;
    const next = user?.id ?? null;
    // Clear cached data on any identity change (incl. user -> null and null -> user), outside setState.
    if (prev !== undefined && prev !== next) queryClient.clear();
    if (prev !== next) setSignOutError(null);
    currentUid.current = next;
    setState({ status: status ?? (user ? "signed_in" : "signed_out"), user });
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    try {
      const a: SessionSource = source ?? (supabase.auth as unknown as SessionSource);
      authRef.current = a;
      const { data } = a.onAuthStateChange((event, session) => {
        if (!active) return;
        if (event === "TOKEN_REFRESHED" && toUser(session?.user)?.id === currentUid.current) return;
        generation.current++;
        apply(toUser(session?.user));
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const my = generation.current;
      a.getSession().then(
        (res) => {
          if (!active || generation.current !== my) return;
          if (res?.error) { apply(null, "unavailable"); return; }
          apply(toUser(res?.data?.session?.user));
        },
        () => {
          if (!active || generation.current !== my) return;
          apply(null, "unavailable");
        },
      );
    } catch {
      apply(null, "unavailable");
    }
    return () => { active = false; unsubscribe(); authRef.current = null; };
  }, [apply, source]);

  const signOut = useCallback(async (): Promise<boolean> => {
    if (signingOut.current) return false;
    const uid = currentUid.current;
    const a = authRef.current;
    if (!uid || !a) return false;
    const startGen = generation.current;
    signingOut.current = true;
    setSignOutPending(true);
    setSignOutError(null);
    let ok = false;
    try {
      const { error } = await a.signOut();
      ok = !error;
    } catch {
      ok = false;
    }
    signingOut.current = false;
    setSignOutPending(false);
    // Any newer auth event (SIGNED_OUT, or SIGNED_IN for the same or another uid) wins over this completion.
    if (generation.current !== startGen || currentUid.current !== uid) return ok;
    if (!ok) { setSignOutError(SIGN_OUT_FAILED); return false; }
    // Provider confirmed local session removal (no error); reflect it even if the event is late.
    generation.current++;
    apply(null);
    return true;
  }, [apply]);

  return <AuthContext.Provider value={{ ...state, signOut, signOutPending, signOutError }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Test helper / static provider. */
export function StaticAuthProvider({ value, children }: { value: AuthState; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
