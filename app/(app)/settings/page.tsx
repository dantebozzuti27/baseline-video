import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function SettingsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  redirect("/app/settings");
}
