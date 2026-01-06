import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/db/types";

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[getMyProfile] Error:", error);
    return null;
  }
  
  return data as Profile | null;
}


