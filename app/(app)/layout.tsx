import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { displayNameFromProfile } from "@/lib/utils/name";
import AppShell from "./AppShell";
import type { Profile } from "@/lib/db/types";

async function getProfileDirect(supabase: any, userId: string): Promise<Profile | null> {
  // First try with the user's session (RLS)
  const { data: rlsData, error: rlsError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  
  if (rlsData) return rlsData as Profile;
  
  // Fall back to admin client if RLS blocked the read
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (url && serviceRoleKey) {
    try {
      const admin = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      
      const { data, error } = await admin
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (data) return data as Profile;
      if (error) console.error("[AppLayout] Admin query error:", error);
    } catch (e) {
      console.error("[AppLayout] Admin client error:", e);
    }
  } else {
    console.error("[AppLayout] Missing SUPABASE_SERVICE_ROLE_KEY env var");
  }
  
  if (rlsError) console.error("[AppLayout] RLS query error:", rlsError);
  return null;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const profile = await getProfileDirect(supabase, user.id);
  
  console.log("[AppLayout] User:", user.id, "Profile found:", !!profile);
  
  if (!profile) {
    // Only redirect if we're sure there's no profile
    // Add a flag to prevent infinite loops
    redirect("/onboarding?from=app");
  }
  if ((profile as any).is_active === false) redirect("/inactive");

  return (
    <AppShell 
      role={profile.role} 
      displayName={displayNameFromProfile(profile)}
      isAdmin={(profile as any).is_admin === true}
    >
      {children}
    </AppShell>
  );
}
