import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import UploadForm from "../../upload/uploadForm";

export default async function UploadPage({
  searchParams
}: {
  searchParams?: { owner?: string };
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  return <UploadForm initialOwnerUserId={searchParams?.owner ?? null} />;
}
