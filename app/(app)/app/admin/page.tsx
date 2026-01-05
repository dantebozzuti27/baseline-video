import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card } from "@/components/ui";
import AdminNav from "./AdminNav";
import { Users, AlertTriangle, Video, Calendar, Building2, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

async function getStats() {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    activeUsersToday,
    errorsToday,
    unresolvedErrors,
    videoUploadsToday,
    lessonsToday,
    totalUsers,
    totalTeams,
    weeklyEvents
  ] = await Promise.all([
    admin
      .from("analytics_events")
      .select("user_id")
      .gte("created_at", today)
      .not("user_id", "is", null),

    admin
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today),

    admin
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null),

    admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "video_upload")
      .gte("created_at", today),

    admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "lesson_request")
      .gte("created_at", today),

    admin.from("profiles").select("user_id", { count: "exact", head: true }),

    admin.from("teams").select("id", { count: "exact", head: true }),

    admin
      .from("analytics_events")
      .select("event_type, created_at")
      .gte("created_at", weekAgo)
  ]);

  // Count unique active users
  const uniqueActiveUsers = new Set((activeUsersToday.data || []).map((e: any) => e.user_id)).size;

  // Calculate daily event counts for sparkline
  const eventsByDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    eventsByDay[key] = 0;
  }
  (weeklyEvents.data || []).forEach((event: any) => {
    const day = event.created_at.split("T")[0];
    if (eventsByDay[day] !== undefined) {
      eventsByDay[day]++;
    }
  });

  return {
    activeUsersToday: uniqueActiveUsers,
    errorsToday: errorsToday.count || 0,
    unresolvedErrors: unresolvedErrors.count || 0,
    videoUploadsToday: videoUploadsToday.count || 0,
    lessonsToday: lessonsToday.count || 0,
    totalUsers: totalUsers.count || 0,
    totalTeams: totalTeams.count || 0,
    sparklineData: Object.values(eventsByDay)
  };
}

function SparkLine({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const width = 80;
  const height = 24;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} style={{ marginLeft: "auto" }}>
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  sparkline,
  variant
}: {
  icon: any;
  label: string;
  value: number | string;
  subtext?: string;
  sparkline?: number[];
  variant?: "default" | "warning" | "danger";
}) {
  const colors = {
    default: "var(--text)",
    warning: "var(--warning, #f59e0b)",
    danger: "var(--danger, #ef4444)"
  };
  const color = colors[variant || "default"];

  return (
    <Card className="cardInteractive">
      <div className="row" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Icon size={18} style={{ color }} />
            <span className="muted" style={{ fontSize: 13 }}>
              {label}
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
          {subtext && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {subtext}
            </div>
          )}
        </div>
        {sparkline && <SparkLine data={sparkline} />}
      </div>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const stats = await getStats();

  return (
    <div className="stack">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/app/dashboard" }, { label: "Admin" }]} />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Admin Dashboard</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Monitor usage, errors, and business metrics.
        </div>
      </div>

      <AdminNav />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16
        }}
      >
        <StatCard
          icon={Users}
          label="Active Users Today"
          value={stats.activeUsersToday}
          sparkline={stats.sparklineData}
        />
        <StatCard
          icon={AlertTriangle}
          label="Errors Today"
          value={stats.errorsToday}
          subtext={`${stats.unresolvedErrors} unresolved`}
          variant={stats.unresolvedErrors > 0 ? "danger" : "default"}
        />
        <StatCard icon={Video} label="Uploads Today" value={stats.videoUploadsToday} />
        <StatCard icon={Calendar} label="Lessons Today" value={stats.lessonsToday} />
        <StatCard icon={Users} label="Total Users" value={stats.totalUsers} />
        <StatCard icon={Building2} label="Total Teams" value={stats.totalTeams} />
      </div>

      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Quick Actions</div>
        </div>
        <div className="row" style={{ gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <a href="/app/admin/errors" className="btn">
            View All Errors
          </a>
          <a href="/app/admin/usage" className="btn">
            Usage Analytics
          </a>
          <a href="/app/admin/business" className="btn">
            Business Metrics
          </a>
        </div>
      </Card>
    </div>
  );
}

