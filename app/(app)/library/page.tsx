import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function LibraryAlias({
  searchParams
}: {
  searchParams: { cat?: string; sort?: string };
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app");
  const qs = new URLSearchParams();
  if (searchParams.cat) qs.set("cat", searchParams.cat);
  if (searchParams.sort) qs.set("sort", searchParams.sort);
  redirect(`/app/library${qs.toString() ? `?${qs.toString()}` : ""}`);
}


