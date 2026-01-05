import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import AdminNav from "../AdminNav";
import EventsClient from "./EventsClient";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const admin = createSupabaseAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await admin
    .from("analytics_events")
    .select("id, event_type, user_id, metadata, created_at")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(1000);

  // Get user display names for the events
  const userIds = [...new Set((events || []).map((e: any) => e.user_id).filter(Boolean))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const userMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.display_name]));

  const eventsWithUsers = (events || []).map((e: any) => ({
    ...e,
    user_name: e.user_id ? userMap[e.user_id] || "Unknown" : "—"
  }));

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Events" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Event Log</div>
        <div className="muted" style={{ marginTop: 6 }}>
          All tracked events (last 30 days, max 1000)
        </div>
      </div>

      <AdminNav />

      <EventsClient events={eventsWithUsers} />
    </div>
  );
}

