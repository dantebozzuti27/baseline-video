import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import LandingPage from "./(marketing)/LandingPage";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return <LandingPage />;
  const profile = await getMyProfile();
  if (!profile) redirect("/onboarding");
  redirect(profile.role === "coach" ? "/app/dashboard" : "/app");
}


