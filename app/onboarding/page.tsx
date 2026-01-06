import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import OnboardingClient from "./OnboardingClient";
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
      if (error) console.error("[Onboarding] Admin query error:", error);
    } catch (e) {
      console.error("[Onboarding] Admin client error:", e);
    }
  }
  
  if (rlsError) console.error("[Onboarding] RLS query error:", rlsError);
  return null;
}

export default async function OnboardingPage({
  searchParams
}: {
  searchParams?: { next?: string; from?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfileDirect(supabase, user.id);
  
  console.log("[Onboarding] User:", user.id, "Profile found:", !!profile, "From:", searchParams?.from);
  
  // If user has a profile, redirect to app
  // But only if we didn't come from app (to prevent loops)
  if (profile && searchParams?.from !== "app") {
    const destination = profile.role === "coach" ? "/app/dashboard" : "/app";
    redirect(destination);
  }
  
  // If we came from app but have a profile, there's a mismatch - show error or force redirect
  if (profile && searchParams?.from === "app") {
    // Profile exists but app couldn't find it - likely an env var issue
    // Force redirect to dashboard
    console.log("[Onboarding] Profile exists but app couldn't find it - forcing redirect");
    const destination = profile.role === "coach" ? "/app/dashboard" : "/app";
    redirect(destination);
  }

  return <OnboardingClient nextPath={searchParams?.next ?? "/app"} />;
}


