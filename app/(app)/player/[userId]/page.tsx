import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function PlayerPage({
  params,
  searchParams
}: {
  params: { userId: string };
  searchParams: { cat?: string; sort?: string };
}) {
  const myProfile = await getMyProfile();
  if (!myProfile) redirect("/sign-in");
  if (myProfile.role !== "coach") redirect("/app");

  const qs = new URLSearchParams();
  if (searchParams.cat) qs.set("cat", searchParams.cat);
  if (searchParams.sort) qs.set("sort", searchParams.sort);
  redirect(`/app/player/${params.userId}${qs.toString() ? `?${qs.toString()}` : ""}`);
}


