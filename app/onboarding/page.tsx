import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams
}: {
  searchParams?: { next?: string };
}) {
  // #region agent log
  console.log('[DEBUG] onboarding page.tsx START', { next: searchParams?.next });
  // #endregion
  
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  
  // #region agent log
  console.log('[DEBUG] onboarding page.tsx auth', { hasUser: !!user, userId: user?.id });
  // #endregion
  
  if (!user) {
    // #region agent log
    console.log('[DEBUG] onboarding page.tsx NO USER - redirecting to sign-in');
    // #endregion
    redirect("/sign-in");
  }

  // #region agent log
  console.log('[DEBUG] onboarding page.tsx rendering OnboardingClient');
  // #endregion
  
  // Don't check profile here - just show onboarding
  // The client component will handle the flow and navigation
  return <OnboardingClient nextPath={searchParams?.next ?? "/app"} />;
}



