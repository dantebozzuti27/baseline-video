import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/db/types";

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Use admin client to bypass RLS - this ensures we always get the profile
  // regardless of RLS policy issues
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("profiles").select("*").eq("user_id", user.id).maybeSingle();

  if (error) {
    console.error("[getMyProfile] Error fetching profile:", error);
    return null;
  }
  return data as Profile | null;
}


