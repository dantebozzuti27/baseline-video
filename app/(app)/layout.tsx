import { redirect } from "next/navigation";
import { unstable_noStore } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { displayNameFromProfile } from "@/lib/utils/name";
import AppShell from "./AppShell";
import type { Profile } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  unstable_noStore();
  
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  // Try RLS first
  let profile: Profile | null = null;
  const { data: rlsData } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  
  if (rlsData) {
    profile = rlsData as Profile;
  } else {
    // Fallback to admin
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (url && key) {
      const admin = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data } = await admin
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) profile = data as Profile;
    }
  }
  
  if (!profile) redirect("/onboarding");
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
