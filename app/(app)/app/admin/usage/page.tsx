import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card } from "@/components/ui";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

async function getUsageData() {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [allEvents, recentEvents] = await Promise.all([
    admin
      .from("analytics_events")
      .select("event_type, user_id, created_at")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false }),

    admin
      .from("analytics_events")
      .select("event_type, user_id, created_at")
      .gte("created_at", sevenDaysAgo)
  ]);

  // Calculate daily active users for the last 30 days
  const dailyActiveUsers: Record<string, Set<string>> = {};
  const eventsByType: Record<string, number> = {};
  const eventsByDay: Record<string, number> = {};

  // Initialize all days
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    dailyActiveUsers[key] = new Set();
    eventsByDay[key] = 0;
  }

  (allEvents.data || []).forEach((event: any) => {
    const day = event.created_at.split("T")[0];
    if (dailyActiveUsers[day]) {
      if (event.user_id) {
        dailyActiveUsers[day].add(event.user_id);
      }
      eventsByDay[day]++;
    }
    eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;
  });

  // Convert Sets to counts
  const dauData = Object.entries(dailyActiveUsers).map(([date, users]) => ({
    date,
    count: users.size
  }));

  // Sort event types by count
  const topEventTypes = Object.entries(eventsByType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return {
    dauData,
    eventsByDay: Object.entries(eventsByDay).map(([date, count]) => ({ date, count })),
    topEventTypes,
    totalEvents30d: allEvents.data?.length || 0,
    totalEvents7d: recentEvents.data?.length || 0
  };
}

function BarChart({ data, maxValue }: { data: { label: string; value: number }[]; maxValue: number }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {data.map((item) => (
        <div key={item.label} className="row" style={{ alignItems: "center", gap: 12 }}>
          <div style={{ width: 120, fontSize: 12, textAlign: "right", flexShrink: 0 }}>
            {item.label}
          </div>
          <div style={{ flex: 1, background: "var(--bg-subtle, #222)", borderRadius: 4, height: 20 }}>
            <div
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                height: "100%",
                background: "var(--accent)",
                borderRadius: 4,
                minWidth: item.value > 0 ? 4 : 0
              }}
            />
          </div>
          <div style={{ width: 50, fontSize: 12, fontWeight: 600 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 600;
  const height = 120;
  const padding = 30;

  const points = data
    .map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.count / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  // Get labels for x-axis (every 7 days)
  const xLabels = data.filter((_, i) => i % 7 === 0 || i === data.length - 1);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={padding}
          x2={width - padding}
          y1={height - padding - pct * (height - padding * 2)}
          y2={height - padding - pct * (height - padding * 2)}
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}

      {/* Data line */}
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />

      {/* Y-axis labels */}
      <text x={padding - 5} y={height - padding} fontSize="10" fill="var(--muted)" textAnchor="end">
        0
      </text>
      <text x={padding - 5} y={padding + 4} fontSize="10" fill="var(--muted)" textAnchor="end">
        {max}
      </text>

      {/* X-axis labels */}
      {xLabels.map((d, i) => {
        const idx = data.findIndex((dd) => dd.date === d.date);
        const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
        return (
          <text
            key={d.date}
            x={x}
            y={height - 8}
            fontSize="9"
            fill="var(--muted)"
            textAnchor="middle"
          >
            {d.date.slice(5)}
          </text>
        );
      })}
    </svg>
  );
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
          Track how users interact with your product.
        </div>
      </div>

      <AdminNav />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>
            Events (7 days)
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{usage.totalEvents7d}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>
            Events (30 days)
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{usage.totalEvents30d}</div>
        </Card>
      </div>

      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Daily Active Users (30 days)</div>
        </div>
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <LineChart data={usage.dauData} />
        </div>
      </Card>

      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Events by Day (30 days)</div>
        </div>
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <LineChart data={usage.eventsByDay} />
        </div>
      </Card>

      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Top Event Types (30 days)</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <BarChart
            data={usage.topEventTypes.map(([type, count]) => ({ label: type, value: count }))}
            maxValue={usage.topEventTypes[0]?.[1] || 1}
          />
        </div>
      </Card>
    </div>
  );
}

