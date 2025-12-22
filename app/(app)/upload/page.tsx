import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import UploadForm from "./uploadForm";

export default async function UploadPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  return <UploadForm />;
}


