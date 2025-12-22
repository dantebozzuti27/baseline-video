import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function VideoDetailPage({ params }: { params: { id: string } }) {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  redirect(`/app/videos/${params.id}`);
}
