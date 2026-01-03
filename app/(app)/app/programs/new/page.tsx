import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import NewProgramClient from "./NewProgramClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewProgramPage() {
  noStore();
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app");
  return <NewProgramClient />;
}


