import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, Pill } from "@/components/ui";
import AdminNav from "../AdminNav";
import { CheckCircle, AlertTriangle, XCircle, Database, HardDrive, Clock, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

async function getHealthData() {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  // Error rates
  const { count: errorsToday } = await admin
    .from("error_logs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", oneDayAgo);

  const { count: errorsLastHour } = await admin
    .from("error_logs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", oneHourAgo);

  const { count: unresolvedErrors } = await admin
    .from("error_logs")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);

  // Error breakdown by type and endpoint
  const { data: recentErrors } = await admin
    .from("error_logs")
    .select("error_type, endpoint, created_at")
    .gte("created_at", oneDayAgo);

  const errorsByType: Record<string, number> = {};
  const errorsByEndpoint: Record<string, number> = {};
  
  (recentErrors || []).forEach((e: any) => {
    errorsByType[e.error_type] = (errorsByType[e.error_type] || 0) + 1;
    if (e.endpoint) {
      errorsByEndpoint[e.endpoint] = (errorsByEndpoint[e.endpoint] || 0) + 1;
    }
  });

  // Get storage usage (estimate from video count)
  const { count: totalVideos } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("source", "upload");

  // Database row counts
  const { count: profileCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  const { count: videoCount } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true });

  const { count: commentCount } = await admin
    .from("comments")
    .select("id", { count: "exact", head: true });

  const { count: lessonCount } = await admin
    .from("lessons")
    .select("id", { count: "exact", head: true });

  const { count: eventCount } = await admin
    .from("analytics_events")
    .select("id", { count: "exact", head: true });

  // API endpoint hit counts (from events)
  const { data: apiEvents } = await admin
    .from("analytics_events")
    .select("metadata")
    .gte("created_at", oneDayAgo)
    .eq("event_type", "page_view");

  const pageHits: Record<string, number> = {};
  (apiEvents || []).forEach((e: any) => {
    const path = e.metadata?.path;
    if (path) {
      pageHits[path] = (pageHits[path] || 0) + 1;
    }
  });

  // System health status
  const errorRate = errorsLastHour || 0;
  let healthStatus: "healthy" | "warning" | "critical" = "healthy";
  if (errorRate > 10) healthStatus = "critical";
  else if (errorRate > 5) healthStatus = "warning";

  return {
    health: {
      status: healthStatus,
      errorsLastHour: errorsLastHour || 0,
      errorsToday: errorsToday || 0,
      unresolvedErrors: unresolvedErrors || 0
    },
    errors: {
      byType: Object.entries(errorsByType).sort((a, b) => b[1] - a[1]),
      byEndpoint: Object.entries(errorsByEndpoint).sort((a, b) => b[1] - a[1]).slice(0, 10)
    },
    storage: {
      estimatedVideos: totalVideos || 0,
      // Rough estimate: assume average video is 50MB
      estimatedStorageGB: Math.round((totalVideos || 0) * 50 / 1024 * 10) / 10
    },
    database: {
      profiles: profileCount || 0,
      videos: videoCount || 0,
      comments: commentCount || 0,
      lessons: lessonCount || 0,
      events: eventCount || 0
    },
    topPages: Object.entries(pageHits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  };
}

function StatusBadge({ status }: { status: "healthy" | "warning" | "critical" }) {
  const config = {
    healthy: { icon: CheckCircle, color: "#4ade80", label: "Healthy" },
    warning: { icon: AlertTriangle, color: "#fbbf24", label: "Warning" },
    critical: { icon: XCircle, color: "#f87171", label: "Critical" }
  };
  
  const { icon: Icon, color, label } = config[status];
  
  return (
    <div className="row" style={{ gap: 8, alignItems: "center" }}>
      <Icon size={24} color={color} />
      <span style={{ fontSize: 18, fontWeight: 800, color }}>{label}</span>
    </div>
  );
}

function BarChart({ data, maxValue }: { data: { label: string; value: number }[]; maxValue: number }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {data.map((item) => (
        <div key={item.label} className="row" style={{ alignItems: "center", gap: 12 }}>
          <div style={{ 
            width: 160, 
            fontSize: 11, 
            textAlign: "right", 
            flexShrink: 0, 
            overflow: "hidden", 
            textOverflow: "ellipsis", 
            whiteSpace: "nowrap",
            fontFamily: "ui-monospace, monospace"
          }}>
            {item.label}
          </div>
          <div style={{ flex: 1, background: "rgba(255, 255, 255, 0.05)", borderRadius: 4, height: 20 }}>
            <div
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                height: "100%",
                background: item.value > maxValue * 0.7 
                  ? "linear-gradient(90deg, #f87171, rgba(248, 113, 113, 0.6))"
                  : "linear-gradient(90deg, var(--primary), rgba(99, 179, 255, 0.6))",
                borderRadius: 4,
                minWidth: item.value > 0 ? 4 : 0
              }}
            />
          </div>
          <div style={{ width: 40, fontSize: 12, fontWeight: 600 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export default async function AdminHealthPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const data = await getHealthData();

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Health" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>System Health</div>
        <div className="muted" style={{ marginTop: 6 }}>
          API performance, errors, storage, and database stats.
        </div>
      </div>

      <AdminNav />

      {/* Health Status */}
      <Card className="cardInteractive">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <StatusBadge status={data.health.status} />
          <div className="row" style={{ gap: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{data.health.errorsLastHour}</div>
              <div className="muted" style={{ fontSize: 11 }}>Errors (1hr)</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{data.health.errorsToday}</div>
              <div className="muted" style={{ fontSize: 11 }}>Errors (24hr)</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: data.health.unresolvedErrors > 0 ? "var(--danger)" : "inherit" }}>
                {data.health.unresolvedErrors}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>Unresolved</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Error Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 16 }}>
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Errors by Type (24hr)</div>
          </div>
          <div style={{ marginTop: 16 }}>
            {data.errors.byType.length > 0 ? (
              <BarChart
                data={data.errors.byType.map(([type, count]) => ({ label: type, value: count }))}
                maxValue={data.errors.byType[0]?.[1] || 1}
              />
            ) : (
              <div className="muted" style={{ textAlign: "center", padding: 16 }}>
                <CheckCircle size={24} style={{ marginBottom: 8 }} />
                <div>No errors in the last 24 hours</div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Errors by Endpoint (24hr)</div>
          </div>
          <div style={{ marginTop: 16 }}>
            {data.errors.byEndpoint.length > 0 ? (
              <BarChart
                data={data.errors.byEndpoint.map(([endpoint, count]) => ({ label: endpoint, value: count }))}
                maxValue={data.errors.byEndpoint[0]?.[1] || 1}
              />
            ) : (
              <div className="muted" style={{ textAlign: "center", padding: 16 }}>
                <CheckCircle size={24} style={{ marginBottom: 8 }} />
                <div>No API errors in the last 24 hours</div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Storage & Database */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
        <Card>
          <div className="row" style={{ gap: 12, alignItems: "center", marginBottom: 16 }}>
            <HardDrive size={20} color="var(--primary)" />
            <div className="cardTitle">Storage</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 900 }}>{data.storage.estimatedStorageGB} GB</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Estimated from {data.storage.estimatedVideos} uploaded videos
          </div>
        </Card>

        <Card>
          <div className="row" style={{ gap: 12, alignItems: "center", marginBottom: 16 }}>
            <Database size={20} color="var(--primary)" />
            <div className="cardTitle">Database Rows</div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Profiles</span>
              <span style={{ fontWeight: 600 }}>{data.database.profiles.toLocaleString()}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Videos</span>
              <span style={{ fontWeight: 600 }}>{data.database.videos.toLocaleString()}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Comments</span>
              <span style={{ fontWeight: 600 }}>{data.database.comments.toLocaleString()}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Lessons</span>
              <span style={{ fontWeight: 600 }}>{data.database.lessons.toLocaleString()}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Analytics Events</span>
              <span style={{ fontWeight: 600 }}>{data.database.events.toLocaleString()}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Top Pages */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Top Pages (24hr)</div>
          <div className="cardSubtitle">Most visited pages</div>
        </div>
        <div style={{ marginTop: 16 }}>
          {data.topPages.length > 0 ? (
            <BarChart
              data={data.topPages.map(([path, count]) => ({ label: path, value: count }))}
              maxValue={data.topPages[0]?.[1] || 1}
            />
          ) : (
            <div className="muted" style={{ textAlign: "center", padding: 16 }}>
              No page view data yet
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

