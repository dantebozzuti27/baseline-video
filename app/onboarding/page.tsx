import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import OnboardingClient from "./OnboardingClient";

export default async function OnboardingPage({
  searchParams
}: {
  searchParams?: { next?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getMyProfile();
  if (profile) redirect("/app");

  return <OnboardingClient nextPath={searchParams?.next ?? "/app"} />;
}


