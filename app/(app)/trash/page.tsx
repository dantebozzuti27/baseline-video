import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function TrashPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  redirect("/app/trash");
}


