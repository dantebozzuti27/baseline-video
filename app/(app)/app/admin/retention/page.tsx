import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, Pill } from "@/components/ui";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

async function getRetentionData() {
  const admin = createSupabaseAdminClient();
  const now = new Date();

  // Get all profiles with created_at
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, role, created_at")
    .order("created_at", { ascending: true });

  // Get all events with user_id and created_at
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await admin
    .from("analytics_events")
    .select("user_id, created_at")
    .gte("created_at", ninetyDaysAgo);

  const users = profiles || [];
  const allEvents = events || [];

  // Group users by signup week
  const cohorts: Record<string, {
    week: string;
    startDate: Date;
    users: string[];
    retention: Record<number, number>; // week number -> count of users active
  }> = {};

  // Get the Monday of a given date
  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Create cohorts for last 8 weeks
  for (let i = 0; i < 8; i++) {
    const weekStart = getWeekStart(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000));
    const key = weekStart.toISOString().split("T")[0];
    cohorts[key] = {
      week: key,
      startDate: weekStart,
      users: [],
      retention: {}
    };
  }

  // Assign users to cohorts
  users.forEach((user: any) => {
    const signupDate = new Date(user.created_at);
    const weekStart = getWeekStart(signupDate);
    const key = weekStart.toISOString().split("T")[0];
    if (cohorts[key]) {
      cohorts[key].users.push(user.user_id);
    }
  });

  // Calculate retention for each cohort
  Object.values(cohorts).forEach((cohort) => {
    if (cohort.users.length === 0) return;

    // For each week after signup, count how many users were active
    for (let weekNum = 0; weekNum <= 8; weekNum++) {
      const weekStart = new Date(cohort.startDate.getTime() + weekNum * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      if (weekStart > now) break;

      const activeUsers = new Set<string>();
      allEvents.forEach((event: any) => {
        if (!event.user_id) return;
        const eventDate = new Date(event.created_at);
        if (eventDate >= weekStart && eventDate < weekEnd && cohort.users.includes(event.user_id)) {
          activeUsers.add(event.user_id);
        }
      });

      cohort.retention[weekNum] = activeUsers.size;
    }
  });

  // Calculate churn - users who haven't been active in 7+ days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const activeUserIds = new Set(
    allEvents
      .filter((e: any) => e.user_id && new Date(e.created_at) >= sevenDaysAgo)
      .map((e: any) => e.user_id)
  );

  const churnedUsers = users.filter((u: any) => {
    const signupDate = new Date(u.created_at);
    // Only count users who signed up more than 7 days ago and haven't been active
    return signupDate < sevenDaysAgo && !activeUserIds.has(u.user_id);
  });

  const atRiskUsers = users.filter((u: any) => {
    // Users who signed up but haven't been active in 7+ days
    const signupDate = new Date(u.created_at);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    return signupDate < fourteenDaysAgo && !activeUserIds.has(u.user_id);
  });

  // Calculate overall retention rates
  const day1Retention = calculateDayRetention(users, allEvents, 1, now);
  const day7Retention = calculateDayRetention(users, allEvents, 7, now);
  const day30Retention = calculateDayRetention(users, allEvents, 30, now);

  return {
    cohorts: Object.values(cohorts)
      .filter((c) => c.users.length > 0)
      .sort((a, b) => new Date(b.week).getTime() - new Date(a.week).getTime()),
    totalUsers: users.length,
    activeUsers7d: activeUserIds.size,
    churnedUsers: churnedUsers.length,
    atRiskUsers: atRiskUsers.length,
    day1Retention,
    day7Retention,
    day30Retention
  };
}

function calculateDayRetention(
  users: any[],
  events: any[],
  days: number,
  now: Date
): number {
  // Users who signed up at least N days ago
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const eligibleUsers = users.filter((u: any) => new Date(u.created_at) <= cutoff);
  
  if (eligibleUsers.length === 0) return 0;

  // Of those, how many were active on or after day N
  let retained = 0;
  eligibleUsers.forEach((user: any) => {
    const signupDate = new Date(user.created_at);
    const retentionWindowStart = new Date(signupDate.getTime() + days * 24 * 60 * 60 * 1000);
    const retentionWindowEnd = new Date(retentionWindowStart.getTime() + 24 * 60 * 60 * 1000);

    const wasActive = events.some((e: any) => {
      if (e.user_id !== user.user_id) return false;
      const eventDate = new Date(e.created_at);
      return eventDate >= retentionWindowStart && eventDate < retentionWindowEnd;
    });

    if (wasActive) retained++;
  });

  return Math.round((retained / eligibleUsers.length) * 100);
}

function RetentionHeatmap({ cohorts }: { cohorts: any[] }) {
  const maxWeeks = 8;

  function getColor(percentage: number): string {
    if (percentage >= 80) return "rgba(74, 222, 128, 0.8)";
    if (percentage >= 60) return "rgba(74, 222, 128, 0.6)";
    if (percentage >= 40) return "rgba(251, 191, 36, 0.6)";
    if (percentage >= 20) return "rgba(251, 191, 36, 0.4)";
    if (percentage > 0) return "rgba(248, 113, 113, 0.4)";
    return "rgba(255, 255, 255, 0.05)";
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="bvDataTable" style={{ minWidth: 600 }}>
        <thead>
          <tr>
            <th>Cohort</th>
            <th>Users</th>
            {Array.from({ length: maxWeeks }, (_, i) => (
              <th key={i} style={{ textAlign: "center" }}>Wk {i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.week}>
              <td style={{ fontWeight: 600 }}>{cohort.week}</td>
              <td>{cohort.users.length}</td>
              {Array.from({ length: maxWeeks }, (_, weekNum) => {
                const count = cohort.retention[weekNum] ?? 0;
                const percentage = cohort.users.length > 0
                  ? Math.round((count / cohort.users.length) * 100)
                  : 0;
                return (
                  <td
                    key={weekNum}
                    style={{
                      background: getColor(percentage),
                      textAlign: "center",
                      fontWeight: 600
                    }}
                  >
                    {count > 0 ? `${percentage}%` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminRetentionPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const data = await getRetentionData();

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Retention" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Retention & Churn</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Track user retention by signup cohort and identify at-risk users.
        </div>
      </div>

      <AdminNav />

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Total Users</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.totalUsers}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Active (7d)</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.activeUsers7d}</div>
          <div style={{ fontSize: 12, color: "var(--success, #4ade80)" }}>
            {data.totalUsers > 0 ? Math.round((data.activeUsers7d / data.totalUsers) * 100) : 0}% of total
          </div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Churned</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "var(--danger)" }}>{data.churnedUsers}</div>
          <div className="muted" style={{ fontSize: 12 }}>Inactive 7+ days</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>At Risk</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "var(--warning, #fbbf24)" }}>{data.atRiskUsers}</div>
          <div className="muted" style={{ fontSize: 12 }}>Inactive 14+ days</div>
        </Card>
      </div>

      {/* Retention Rates */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Retention Rates</div>
          <div className="cardSubtitle">Percentage of users who return on day N</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginTop: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 900 }}>{data.day1Retention}%</div>
            <div className="muted">Day 1</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 900 }}>{data.day7Retention}%</div>
            <div className="muted">Day 7</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 900 }}>{data.day30Retention}%</div>
            <div className="muted">Day 30</div>
          </div>
        </div>
      </Card>

      {/* Cohort Retention Heatmap */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Cohort Retention</div>
          <div className="cardSubtitle">
            Percentage of users retained each week after signup
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          {data.cohorts.length > 0 ? (
            <RetentionHeatmap cohorts={data.cohorts} />
          ) : (
            <div className="muted" style={{ textAlign: "center", padding: 32 }}>
              Not enough data yet. Check back after users have been active.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

