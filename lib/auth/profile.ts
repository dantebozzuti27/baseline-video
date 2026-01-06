import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/db/types";

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Try with server client first (respects RLS)
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();

  if (data) return data as Profile;

  // If RLS blocked the read, try with admin client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (url && serviceRoleKey) {
    try {
      const admin = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: adminData, error: adminError } = await admin
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (adminData) return adminData as Profile;
      if (adminError) console.error("[getMyProfile] Admin query error:", adminError);
    } catch (e) {
      console.error("[getMyProfile] Admin client error:", e);
    }
  }

  if (error) console.error("[getMyProfile] Server query error:", error);
  return null;
}


