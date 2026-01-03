import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";

export default async function UploadPage({
  searchParams
}: {
  searchParams?: { owner?: string; programEnrollmentId?: string; programWeek?: string; programAssignmentId?: string; returnTo?: string };
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  const qs = new URLSearchParams();
  if (searchParams?.owner) qs.set("owner", searchParams.owner);
  if (searchParams?.programEnrollmentId) qs.set("programEnrollmentId", searchParams.programEnrollmentId);
  if (searchParams?.programWeek) qs.set("programWeek", searchParams.programWeek);
  if (searchParams?.programAssignmentId) qs.set("programAssignmentId", searchParams.programAssignmentId);
  if (searchParams?.returnTo) qs.set("returnTo", searchParams.returnTo);
  redirect(`/app/upload${qs.toString() ? `?${qs.toString()}` : ""}`);
}


