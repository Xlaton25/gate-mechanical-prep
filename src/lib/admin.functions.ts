import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function callerIsAdmin({ supabase, userId }: Ctx): Promise<boolean> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error("unavailable");
  return !!data;
}

/** True only when the verified caller holds the admin role (own-row read under RLS). */
export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try { return { isAdmin: await callerIsAdmin(context), error: null }; }
    catch { return { isAdmin: false, error: "unavailable" as const }; }
  });

/** Admin-only: list accounts with their admin status. */
export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await callerIsAdmin(context))) throw new Error("Forbidden");
    const { listUsersWithRoles } = await import("@/server/admin/roles.server");
    return { users: await listUsersWithRoles(), selfId: context.userId };
  });

const toggleInput = z.object({ targetUserId: z.string().uuid(), grant: z.boolean() });

/** Admin-only: grant or revoke admin. Admins cannot revoke themselves. */
export const toggleAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => toggleInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await callerIsAdmin(context))) throw new Error("Forbidden");
    const { setAdminRole } = await import("@/server/admin/roles.server");
    try { await setAdminRole(context.userId, data.targetUserId, data.grant); return { ok: true as const, error: null }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "failed" }; }
  });
