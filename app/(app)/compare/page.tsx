import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function ComparePage({
  searchParams
}: {
  searchParams: { left?: string; right?: string };
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/onboarding");
  if (profile.role !== "coach") redirect("/app");
  const qs = new URLSearchParams();
  if (searchParams.left) qs.set("left", searchParams.left);
  if (searchParams.right) qs.set("right", searchParams.right);
  redirect(`/app/compare${qs.toString() ? `?${qs.toString()}` : ""}`);
}
