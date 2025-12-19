import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function getAuthUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function requireAuthUser(redirectTo?: string) {
  const user = await getAuthUser();
  if (!user) {
    const to = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/";
    redirect(`/auth/signin?redirectTo=${encodeURIComponent(to)}`);
  }
  return user;
}


