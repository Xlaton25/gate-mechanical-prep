import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { PREF_COLUMNS, type PreferencesPatch, type PreferencesRow, type PreferencesStore } from "./preferences";

/**
 * Narrow typed view of public.user_preferences (db/migrations 000001–000003).
 * Only this table is typed here, mirroring its column grants:
 * insert(user_id, daily_minutes, timezone, reset_time) / update(daily_minutes, timezone, reset_time).
 */
type PrefsSchema = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      user_preferences: {
        Row: PreferencesRow & { updated_at: string };
        Insert: PreferencesRow;
        Update: PreferencesPatch;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Browser store using the signed-in user's session; RLS limits every call to auth.uid(). Never the admin client. */
export function supabasePreferencesStore(): PreferencesStore {
  const db = supabase as unknown as SupabaseClient<PrefsSchema>;
  const t = () => db.from("user_preferences");
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
