import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/auth/profile";

export async function GET() {
  try {
    const profile = await getMyProfile();
    if (!profile || !profile.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get counts in parallel
    const [
      activeUsersToday,
      errorsToday,
      videoUploadsToday,
      lessonsToday,
      totalUsers,
      totalTeams,
      recentEvents,
      recentErrors,
      weeklyEvents
    ] = await Promise.all([
      // Active users today (unique users with events)
      admin
        .from("analytics_events")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", today)
        .not("user_id", "is", null),

      // Errors today
      admin
        .from("error_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today),

      // Video uploads today
      admin
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "video_upload")
        .gte("created_at", today),

      // Lessons booked today
      admin
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "lesson_request")
        .gte("created_at", today),

      // Total users
      admin
        .from("profiles")
        .select("user_id", { count: "exact", head: true }),

      // Total teams
      admin
        .from("teams")
        .select("id", { count: "exact", head: true }),

      // Recent events (last 50)
      admin
        .from("analytics_events")
        .select("id, event_type, user_id, team_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(50),

      // Recent errors (last 20)
      admin
        .from("error_logs")
        .select("id, error_type, message, endpoint, created_at, resolved_at")
        .order("created_at", { ascending: false })
        .limit(20),

      // Weekly event breakdown
      admin
        .from("analytics_events")
        .select("event_type, created_at")
        .gte("created_at", weekAgo)
    ]);

    // Calculate weekly trends
    const eventsByDay: Record<string, number> = {};
    const eventsByType: Record<string, number> = {};

    (weeklyEvents.data || []).forEach((event: any) => {
      const day = event.created_at.split("T")[0];
      eventsByDay[day] = (eventsByDay[day] || 0) + 1;
      eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;
    });

    return NextResponse.json({
      overview: {
        activeUsersToday: activeUsersToday.count || 0,
        errorsToday: errorsToday.count || 0,
        videoUploadsToday: videoUploadsToday.count || 0,
        lessonsToday: lessonsToday.count || 0,
        totalUsers: totalUsers.count || 0,
        totalTeams: totalTeams.count || 0
      },
      recentEvents: recentEvents.data || [],
      recentErrors: recentErrors.data || [],
      weeklyTrends: {
        eventsByDay,
        eventsByType
      }
    });
  } catch (e: any) {
    console.error("Admin stats error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

