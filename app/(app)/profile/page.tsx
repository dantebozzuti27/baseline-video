import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function ProfilePage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/onboarding");
  redirect("/settings");
}
