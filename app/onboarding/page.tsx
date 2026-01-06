import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  // Don't check profile here - just show onboarding
  // The client component will handle the flow and navigation
  return <OnboardingClient nextPath={searchParams?.next ?? "/app"} />;
}



