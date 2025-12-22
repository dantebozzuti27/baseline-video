import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getMyProfile();
  if (!profile) redirect("/sign-up");

  return (
    <ProfileClient
      initialFirstName={profile.first_name ?? ""}
      initialLastName={profile.last_name ?? ""}
      email={user.email ?? ""}
      role={profile.role}
    />
  );
}
