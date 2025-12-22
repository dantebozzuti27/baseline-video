import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");
  const profile = await getMyProfile();
  if (!profile) redirect("/onboarding");
  redirect(profile.role === "coach" ? "/app/dashboard" : "/app");
}


