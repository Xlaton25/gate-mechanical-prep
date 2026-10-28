import { supabase } from "@/integrations/supabase/client";
import { PREF_COLUMNS, type PreferencesStore } from "./preferences";

/**
 * Browser store using the signed-in user's session; RLS limits every call to auth.uid().
 * Never the admin client. Updates send ONLY the three granted preference columns
 * (authenticated has no UPDATE privilege on user_id).
 */
export function supabasePreferencesStore(): PreferencesStore {
  const t = () => supabase.from("user_preferences");
  return {
    select: async (userId) => t().select(PREF_COLUMNS).eq("user_id", userId).maybeSingle(),
    insert: async (row) => t().insert(row).select(PREF_COLUMNS).single(),
    update: async (userId, patch) =>
      t()
        .update({ daily_minutes: patch.daily_minutes, timezone: patch.timezone, reset_time: patch.reset_time })
        .eq("user_id", userId)
        .select(PREF_COLUMNS)
        .maybeSingle(),
  };
}
