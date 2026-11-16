import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminUserRow = { userId: string; email: string | null; isAdmin: boolean; createdAt: string | null };

export async function listUsersWithRoles(): Promise<AdminUserRow[]> {
  const { data: roles, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  if (error) throw new Error("roles_unavailable");
  const admins = new Set((roles ?? []).map((r) => r.user_id));
  const { data, error: uErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (uErr) throw new Error("users_unavailable");
  return data.users.map((u) => ({ userId: u.id, email: u.email ?? null, isAdmin: admins.has(u.id), createdAt: u.created_at ?? null }));
}

export async function setAdminRole(callerId: string, targetUserId: string, grant: boolean): Promise<void> {
  if (grant) {
    const { error } = await supabaseAdmin.from("user_roles").upsert({ user_id: targetUserId, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (error) throw new Error("grant_failed");
    return;
  }
  if (targetUserId === callerId) throw new Error("cannot_revoke_self");
  const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", targetUserId).eq("role", "admin");
  if (error) throw new Error("revoke_failed");
}
