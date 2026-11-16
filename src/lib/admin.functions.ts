import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** True only when the verified caller holds the admin role (own-row read under RLS). */
export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (error) return { isAdmin: false, error: "unavailable" as const };
    return { isAdmin: !!data, error: null };
  });
