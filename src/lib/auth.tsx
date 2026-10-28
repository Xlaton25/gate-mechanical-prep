import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AuthStatus = "loading" | "signed_out" | "signed_in" | "unavailable";
export interface AuthUser { id: string; email: string | null }
export interface AuthState { status: AuthStatus; user: AuthUser | null; signOut: () => Promise<void> }

const AuthContext = createContext<AuthState>({ status: "loading", user: null, signOut: async () => {} });

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ status: AuthStatus; user: AuthUser | null }>({ status: "loading", user: null });

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        const user = toUser(session?.user);
        setState((prev) => {
          if (event === "SIGNED_OUT" || (prev.user && user && prev.user.id !== user.id)) queryClient.clear();
          return { status: user ? "signed_in" : "signed_out", user };
        });
      });
      unsubscribe = () => data.subscription.unsubscribe();
      supabase.auth.getSession().then(
        ({ data: d }) => {
          if (!active) return;
          const user = toUser(d.session?.user);
          setState({ status: user ? "signed_in" : "signed_out", user });
        },
        () => active && setState({ status: "unavailable", user: null }),
      );
    } catch {
      setState({ status: "unavailable", user: null });
    }
    return () => { active = false; unsubscribe(); };
  }, [queryClient]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    try { await supabase.auth.signOut(); } catch { /* local session is cleared by the listener */ }
    setState({ status: "signed_out", user: null });
  };

  return <AuthContext.Provider value={{ ...state, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Test helper / static provider. */
export function StaticAuthProvider({ value, children }: { value: AuthState; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
