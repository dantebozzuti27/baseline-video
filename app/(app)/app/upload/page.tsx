import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import UploadForm from "../../upload/uploadForm";

export default async function UploadPage({
  searchParams
}: {
  searchParams?: {
    owner?: string;
    programEnrollmentId?: string;
    programWeek?: string;
    programAssignmentId?: string;
    returnTo?: string;
  };
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  const programWeek = searchParams?.programWeek ? Number(searchParams.programWeek) : null;
  return (
    <UploadForm
      initialOwnerUserId={searchParams?.owner ?? null}
      programEnrollmentId={searchParams?.programEnrollmentId ?? null}
      programWeekIndex={programWeek && Number.isFinite(programWeek) ? programWeek : null}
      programAssignmentId={searchParams?.programAssignmentId ?? null}
      returnTo={searchParams?.returnTo ?? null}
    />
  );
}
