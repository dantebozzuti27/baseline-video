import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card } from "@/components/ui";
import AdminNav from "../AdminNav";
import UsageClient from "./UsageClient";

export const dynamic = "force-dynamic";

async function getUsageData() {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Get all events for 30 days
  const { data: allEvents } = await admin
    .from("analytics_events")
    .select("id, event_type, user_id, metadata, created_at")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false });

  const events = allEvents || [];

  // Calculate metrics
  const dailyActiveUsers: Record<string, Set<string>> = {};
  const eventsByType: Record<string, number> = {};
  const eventsByDay: Record<string, number> = {};
  const pageViews: Record<string, number> = {};
  const deviceBreakdown: Record<string, number> = { mobile: 0, tablet: 0, desktop: 0 };
  const browserBreakdown: Record<string, number> = {};
  const osBreakdown: Record<string, number> = {};
  const hourlyActivity: Record<number, number> = {};
  const sessionDurations: number[] = [];

  // Initialize all days
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    dailyActiveUsers[key] = new Set();
    eventsByDay[key] = 0;
  }

  // Initialize hours
  for (let h = 0; h < 24; h++) {
    hourlyActivity[h] = 0;
  }

  events.forEach((event: any) => {
    const day = event.created_at.split("T")[0];
    const hour = new Date(event.created_at).getHours();

    if (dailyActiveUsers[day]) {
      if (event.user_id) {
        dailyActiveUsers[day].add(event.user_id);
      }
      eventsByDay[day]++;
    }

    eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;
    hourlyActivity[hour]++;

    // Track page views
    if (event.event_type === "page_view" && event.metadata?.path) {
      const path = event.metadata.path as string;
      pageViews[path] = (pageViews[path] || 0) + 1;
    }

    // Track device/browser/os from session_start events
    if (event.event_type === "session_start" && event.metadata) {
      const device = event.metadata.device as string;
      const browser = event.metadata.browser as string;
      const os = event.metadata.os as string;
      if (device) deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;
      if (browser) browserBreakdown[browser] = (browserBreakdown[browser] || 0) + 1;
      if (os) osBreakdown[os] = (osBreakdown[os] || 0) + 1;
    }

    // Track session durations
    if (event.event_type === "session_end" && event.metadata?.duration_seconds) {
      sessionDurations.push(event.metadata.duration_seconds as number);
    }
  });

  // Convert Sets to counts
  const dauData = Object.entries(dailyActiveUsers).map(([date, users]) => ({
    date,
    count: users.size
  }));

  // Top event types
  const topEventTypes = Object.entries(eventsByType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  // Top pages
  const topPages = Object.entries(pageViews)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  // Calculate averages
  const totalSessions = sessionDurations.length;
  const avgSessionDuration = totalSessions > 0
    ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / totalSessions)
    : 0;

  // Today's metrics
  const today = now.toISOString().split("T")[0];
  const todayEvents = events.filter((e: any) => e.created_at.startsWith(today));
  const todayUsers = new Set(todayEvents.filter((e: any) => e.user_id).map((e: any) => e.user_id));

  // This week vs last week
  const thisWeekEvents = events.filter((e: any) => e.created_at >= sevenDaysAgo);
  const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const lastWeekEvents = events.filter((e: any) => 
    e.created_at >= lastWeekStart && e.created_at < sevenDaysAgo
  );

  return {
    // Summary metrics
    todayEvents: todayEvents.length,
    todayUsers: todayUsers.size,
    thisWeekEvents: thisWeekEvents.length,
    lastWeekEvents: lastWeekEvents.length,
    totalEvents30d: events.length,
    avgSessionDuration,
    totalSessions,
    
    // Charts
    dauData,
    eventsByDay: Object.entries(eventsByDay).map(([date, count]) => ({ date, count })),
    topEventTypes,
    topPages,
    deviceBreakdown,
    browserBreakdown,
    osBreakdown,
    hourlyActivity: Object.entries(hourlyActivity).map(([hour, count]) => ({
      hour: parseInt(hour),
      count
    }))
  };
}

export default async function AdminUsagePage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const usage = await getUsageData();

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Usage" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Usage Analytics</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Detailed usage metrics and user behavior.
        </div>
      </div>

      <AdminNav />

      <UsageClient data={usage} />
    </div>
  );
}
