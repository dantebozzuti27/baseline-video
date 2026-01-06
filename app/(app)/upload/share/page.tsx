import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import ShareUploadClient from "./ShareUploadClient";

export const dynamic = "force-dynamic";

export default async function ShareUploadPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  // Parents can't upload
  if (profile.role === "parent") redirect("/app/parent");

  return <ShareUploadClient />;
}

