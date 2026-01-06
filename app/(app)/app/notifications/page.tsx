import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import NotificationsClient from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  const supabase = createSupabaseServerClient();
  
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="stack">
      <Breadcrumbs items={[{ label: "Notifications" }]} />

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
          Notifications
        </h1>
        <p className="muted">
          Stay updated on your videos, lessons, and programs.
        </p>
      </div>

      <NotificationsClient notifications={notifications || []} />
    </div>
  );
}

