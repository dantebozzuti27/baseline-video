import { redirect } from "next/navigation";

export default function AppVideoAlias({ params }: { params: { id: string } }) {
  redirect(`/videos/${params.id}`);
}
