import { redirect } from "next/navigation";

export default function AppPlayerAlias({ params }: { params: { userId: string } }) {
  redirect(`/player/${params.userId}`);
}
