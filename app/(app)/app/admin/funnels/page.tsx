import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card } from "@/components/ui";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

async function getFunnelData() {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Get all profiles
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, role, is_active, created_at");

  // Get all events
  const { data: events } = await admin
    .from("analytics_events")
    .select("event_type, user_id, created_at")
    .gte("created_at", thirtyDaysAgo);

  // Get all videos
  const { data: videos } = await admin
    .from("videos")
    .select("id, uploader_user_id, created_at");

  // Get all comments
  const { data: comments } = await admin
    .from("comments")
    .select("id, user_id, created_at");

  // Get all lessons
  const { data: lessons } = await admin
    .from("lessons")
    .select("id, coach_user_id, created_at");

  const allProfiles = profiles || [];
  const allEvents = events || [];
  const allVideos = videos || [];
  const allComments = comments || [];
  const allLessons = lessons || [];

  // Build user activity map
  const userActivity: Record<string, {
    hasPageView: boolean;
    hasUpload: boolean;
    hasComment: boolean;
    hasLesson: boolean;
    hasMultipleUploads: boolean;
    daysActive: number;
  }> = {};

  allProfiles.forEach((p: any) => {
    userActivity[p.user_id] = {
      hasPageView: false,
      hasUpload: false,
      hasComment: false,
      hasLesson: false,
      hasMultipleUploads: false,
      daysActive: 0
    };
  });

  // Track page views
  const userPageViews: Record<string, Set<string>> = {};
  allEvents.forEach((e: any) => {
    if (!e.user_id) return;
    if (!userPageViews[e.user_id]) userPageViews[e.user_id] = new Set();
    userPageViews[e.user_id].add(e.created_at.split("T")[0]);
    
    if (userActivity[e.user_id]) {
      userActivity[e.user_id].hasPageView = true;
    }
  });

  // Calculate days active
  Object.entries(userPageViews).forEach(([userId, days]) => {
    if (userActivity[userId]) {
      userActivity[userId].daysActive = days.size;
    }
  });

  // Track uploads
  const userUploads: Record<string, number> = {};
  allVideos.forEach((v: any) => {
    if (!v.uploader_user_id) return;
    userUploads[v.uploader_user_id] = (userUploads[v.uploader_user_id] || 0) + 1;
    if (userActivity[v.uploader_user_id]) {
      userActivity[v.uploader_user_id].hasUpload = true;
      if (userUploads[v.uploader_user_id] > 1) {
        userActivity[v.uploader_user_id].hasMultipleUploads = true;
      }
    }
  });

  // Track comments
  allComments.forEach((c: any) => {
    if (userActivity[c.user_id]) {
      userActivity[c.user_id].hasComment = true;
    }
  });

  // Track lessons
  allLessons.forEach((l: any) => {
    if (userActivity[l.coach_user_id]) {
      userActivity[l.coach_user_id].hasLesson = true;
    }
  });

  // Calculate funnel metrics
  const totalUsers = allProfiles.length;
  const usersWithPageView = Object.values(userActivity).filter((u) => u.hasPageView).length;
  const usersWithUpload = Object.values(userActivity).filter((u) => u.hasUpload).length;
  const usersWithMultipleUploads = Object.values(userActivity).filter((u) => u.hasMultipleUploads).length;
  const usersWithComment = Object.values(userActivity).filter((u) => u.hasComment).length;
  const usersWithLesson = Object.values(userActivity).filter((u) => u.hasLesson).length;
  const usersActiveMultipleDays = Object.values(userActivity).filter((u) => u.daysActive > 1).length;
  const weeklyActiveUsers = Object.values(userActivity).filter((u) => u.daysActive >= 3).length;

  // Signup to activation funnel
  const signupFunnel = [
    { step: "Signed Up", count: totalUsers, rate: 100 },
    { step: "Visited App", count: usersWithPageView, rate: totalUsers > 0 ? Math.round((usersWithPageView / totalUsers) * 100) : 0 },
    { step: "First Upload", count: usersWithUpload, rate: totalUsers > 0 ? Math.round((usersWithUpload / totalUsers) * 100) : 0 },
    { step: "Multiple Uploads", count: usersWithMultipleUploads, rate: totalUsers > 0 ? Math.round((usersWithMultipleUploads / totalUsers) * 100) : 0 },
    { step: "Left Comment", count: usersWithComment, rate: totalUsers > 0 ? Math.round((usersWithComment / totalUsers) * 100) : 0 },
    { step: "Active 3+ Days", count: weeklyActiveUsers, rate: totalUsers > 0 ? Math.round((weeklyActiveUsers / totalUsers) * 100) : 0 }
  ];

  // Feature adoption
  const featureAdoption = [
    { feature: "Video Upload", users: usersWithUpload, rate: totalUsers > 0 ? Math.round((usersWithUpload / totalUsers) * 100) : 0 },
    { feature: "Comments", users: usersWithComment, rate: totalUsers > 0 ? Math.round((usersWithComment / totalUsers) * 100) : 0 },
    { feature: "Lessons", users: usersWithLesson, rate: totalUsers > 0 ? Math.round((usersWithLesson / totalUsers) * 100) : 0 }
  ];

  // Search analytics
  const searchEvents = allEvents.filter((e: any) => e.event_type === "search");
  const searchQueries: Record<string, number> = {};
  searchEvents.forEach((e: any) => {
    const query = (e.metadata as any)?.query;
    if (query) {
      searchQueries[query] = (searchQueries[query] || 0) + 1;
    }
  });
  const topSearches = Object.entries(searchQueries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({ query, count }));

  return {
    signupFunnel,
    featureAdoption,
    topSearches,
    summary: {
      totalUsers,
      activatedUsers: usersWithUpload,
      activationRate: totalUsers > 0 ? Math.round((usersWithUpload / totalUsers) * 100) : 0,
      engagedUsers: weeklyActiveUsers,
      engagementRate: totalUsers > 0 ? Math.round((weeklyActiveUsers / totalUsers) * 100) : 0
    }
  };
}

function FunnelChart({ steps }: { steps: { step: string; count: number; rate: number }[] }) {
  const maxCount = steps[0]?.count || 1;

  return (
    <div className="stack" style={{ gap: 0 }}>
      {steps.map((step, i) => {
        const widthPercent = (step.count / maxCount) * 100;
        const dropoff = i > 0 ? steps[i - 1].count - step.count : 0;
        const dropoffPercent = i > 0 && steps[i - 1].count > 0
          ? Math.round((dropoff / steps[i - 1].count) * 100)
          : 0;

        return (
          <div key={step.step} style={{ position: "relative" }}>
            <div
              style={{
                background: `linear-gradient(90deg, var(--primary), rgba(99, 179, 255, ${0.3 + (i / steps.length) * 0.5}))`,
                height: 56,
                width: `${Math.max(widthPercent, 20)}%`,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 16px",
                marginBottom: 4,
                transition: "width 0.5s ease"
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{step.step}</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{step.count}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{step.rate}%</div>
              </div>
            </div>
            {i > 0 && dropoff > 0 && (
              <div
                style={{
                  position: "absolute",
                  right: -80,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 11,
                  color: "var(--danger)"
                }}
              >
                -{dropoff} ({dropoffPercent}%)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BarChart({ data, maxValue }: { data: { label: string; value: number; rate?: number }[]; maxValue: number }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      {data.map((item) => (
        <div key={item.label}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
            <span style={{ fontSize: 12 }}>
              {item.value} {item.rate !== undefined && <span className="muted">({item.rate}%)</span>}
            </span>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.05)", borderRadius: 4, height: 24 }}>
            <div
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                height: "100%",
                background: "linear-gradient(90deg, var(--primary), rgba(99, 179, 255, 0.6))",
                borderRadius: 4,
                minWidth: item.value > 0 ? 4 : 0
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function AdminFunnelsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const data = await getFunnelData();

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Funnels" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Funnels & Feature Adoption</div>
        <div className="muted" style={{ marginTop: 6 }}>
          User activation funnel and feature usage analytics.
        </div>
      </div>

      <AdminNav />

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Total Users</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.summary.totalUsers}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Activated</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.summary.activatedUsers}</div>
          <div style={{ fontSize: 12, color: "var(--success, #4ade80)" }}>
            {data.summary.activationRate}% activation rate
          </div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Engaged (3+ days)</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.summary.engagedUsers}</div>
          <div style={{ fontSize: 12, color: "var(--success, #4ade80)" }}>
            {data.summary.engagementRate}% engagement rate
          </div>
        </Card>
      </div>

      {/* Signup Funnel */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">User Activation Funnel</div>
          <div className="cardSubtitle">From signup to engaged user (30 days)</div>
        </div>
        <div style={{ marginTop: 24, paddingRight: 80 }}>
          <FunnelChart steps={data.signupFunnel} />
        </div>
      </Card>

      {/* Feature Adoption */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Feature Adoption</div>
          <div className="cardSubtitle">Percentage of users who have used each feature</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <BarChart
            data={data.featureAdoption.map((f) => ({
              label: f.feature,
              value: f.users,
              rate: f.rate
            }))}
            maxValue={data.summary.totalUsers || 1}
          />
        </div>
      </Card>

      {/* Top Searches */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Top Searches</div>
          <div className="cardSubtitle">What users are searching for</div>
        </div>
        <div style={{ marginTop: 16 }}>
          {data.topSearches.length > 0 ? (
            <div className="stack" style={{ gap: 8 }}>
              {data.topSearches.map((s, i) => (
                <div key={s.query} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div className="row" style={{ gap: 12, alignItems: "center" }}>
                    <span style={{ 
                      width: 24, 
                      height: 24, 
                      borderRadius: 4, 
                      background: "rgba(99, 179, 255, 0.2)", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      {i + 1}
                    </span>
                    <code style={{ fontSize: 13 }}>{s.query}</code>
                  </div>
                  <span style={{ fontWeight: 600 }}>{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ textAlign: "center", padding: 24 }}>
              No search data yet. Users need to use the search feature.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

