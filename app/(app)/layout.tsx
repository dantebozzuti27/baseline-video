import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { displayNameFromProfile } from "@/lib/utils/name";
import AppShell from "./AppShell";
import type { Profile } from "@/lib/db/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Middleware handles sign-in redirect, but double-check
  if (!user) redirect("/sign-in");

  // Query profile - middleware already verified this exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  
  // If no profile, the middleware should have caught this
  // Don't redirect here to avoid loops - just render with defaults
  if (!profile) {
    return (
      <AppShell role="player" displayName="Loading..." isAdmin={false}>
        {children}
      </AppShell>
    );
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
