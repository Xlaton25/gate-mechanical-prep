import { createMiddleware } from "@tanstack/react-start";

/**
 * Client-side: attaches the current session's bearer token to server-function calls.
 * The Supabase client is loaded lazily so SSR never initialises browser storage.
 * The server re-verifies the token (requireSupabaseAuth); this is not a trust boundary.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  let token: string | undefined;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    token = (await supabase.auth.getSession()).data.session?.access_token;
  } catch {
    token = undefined;
  }
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
