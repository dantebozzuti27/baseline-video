import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function UploadPage({
  searchParams
}: {
  searchParams?: { owner?: string };
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  const qs = new URLSearchParams();
  if (searchParams?.owner) qs.set("owner", searchParams.owner);
  redirect(`/app/upload${qs.toString() ? `?${qs.toString()}` : ""}`);
}


