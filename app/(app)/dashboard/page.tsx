import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function DashboardAlias() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  redirect(profile.role === "coach" ? "/app/dashboard" : "/app");
}
