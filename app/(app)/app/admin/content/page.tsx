import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, Pill } from "@/components/ui";
import AdminNav from "../AdminNav";
import { formatDate } from "@/lib/utils/datetime";

export const dynamic = "force-dynamic";

async function getContentData() {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get video stats
  const { data: videos, count: totalVideos } = await admin
    .from("videos")
    .select("id, title, category, source, created_at, view_count, uploader_user_id", { count: "exact" });

  const { count: videosThisMonth } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo);

  const { count: videosThisWeek } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo);

  // Get comment stats
  const { count: totalComments } = await admin
    .from("comments")
    .select("id", { count: "exact", head: true });

  const { count: commentsThisWeek } = await admin
    .from("comments")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo);

  // Get lesson stats
  const { data: lessons, count: totalLessons } = await admin
    .from("lessons")
    .select("id, status, mode, start_at, coach_user_id, created_at", { count: "exact" });

  const { count: lessonsThisWeek } = await admin
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo);

  // Get program stats
  const { count: totalPrograms } = await admin
    .from("program_templates")
    .select("id", { count: "exact", head: true });

  const { count: totalEnrollments } = await admin
    .from("program_enrollments")
    .select("id", { count: "exact", head: true });

  const { count: activeEnrollments } = await admin
    .from("program_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  // Calculate video stats
  const videosByCategory = { game: 0, training: 0 };
  const videosBySource = { upload: 0, link: 0 };
  (videos || []).forEach((v: any) => {
    if (v.category === "game") videosByCategory.game++;
    else if (v.category === "training") videosByCategory.training++;
    if (v.source === "upload") videosBySource.upload++;
    else if (v.source === "link") videosBySource.link++;
  });

  // Calculate lesson stats
  const lessonsByStatus = { pending: 0, approved: 0, declined: 0, cancelled: 0, completed: 0 };
  const lessonsByMode = { in_person: 0, remote: 0 };
  const upcomingLessons: any[] = [];
  
  (lessons || []).forEach((l: any) => {
    if (l.status && lessonsByStatus[l.status as keyof typeof lessonsByStatus] !== undefined) {
      lessonsByStatus[l.status as keyof typeof lessonsByStatus]++;
    }
    if (l.mode === "in_person") lessonsByMode.in_person++;
    else if (l.mode === "remote") lessonsByMode.remote++;
    
    // Upcoming lessons
    if (l.status === "approved" && new Date(l.start_at) > now) {
      upcomingLessons.push(l);
    }
  });

  // Popular booking times
  const bookingHours: Record<number, number> = {};
  for (let h = 0; h < 24; h++) bookingHours[h] = 0;
  (lessons || []).forEach((l: any) => {
    if (l.start_at) {
      const hour = new Date(l.start_at).getHours();
      bookingHours[hour]++;
    }
  });

  // Top uploaders
  const uploaderCounts: Record<string, number> = {};
  (videos || []).forEach((v: any) => {
    if (v.uploader_user_id) {
      uploaderCounts[v.uploader_user_id] = (uploaderCounts[v.uploader_user_id] || 0) + 1;
    }
  });
  const topUploaderIds = Object.entries(uploaderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count }));

  // Get names for top uploaders
  const { data: uploaderProfiles } = await admin
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", topUploaderIds.map((u) => u.id));
  
  const uploaderNames = Object.fromEntries(
    (uploaderProfiles || []).map((p: any) => [p.user_id, p.display_name])
  );

  const topUploaders = topUploaderIds.map((u) => ({
    name: uploaderNames[u.id] || "Unknown",
    count: u.count
  }));

  return {
    videos: {
      total: totalVideos || 0,
      thisMonth: videosThisMonth || 0,
      thisWeek: videosThisWeek || 0,
      byCategory: videosByCategory,
      bySource: videosBySource,
      topUploaders
    },
    comments: {
      total: totalComments || 0,
      thisWeek: commentsThisWeek || 0,
      avgPerVideo: totalVideos ? Math.round((totalComments || 0) / totalVideos * 10) / 10 : 0
    },
    lessons: {
      total: totalLessons || 0,
      thisWeek: lessonsThisWeek || 0,
      byStatus: lessonsByStatus,
      byMode: lessonsByMode,
      upcoming: upcomingLessons.length,
      popularHours: Object.entries(bookingHours)
        .map(([hour, count]) => ({ hour: parseInt(hour), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    },
    programs: {
      total: totalPrograms || 0,
      totalEnrollments: totalEnrollments || 0,
      activeEnrollments: activeEnrollments || 0
    }
  };
}

function BarChart({ data, maxValue }: { data: { label: string; value: number }[]; maxValue: number }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {data.map((item) => (
        <div key={item.label} className="row" style={{ alignItems: "center", gap: 12 }}>
          <div style={{ width: 100, fontSize: 12, textAlign: "right", flexShrink: 0 }}>
            {item.label}
          </div>
          <div style={{ flex: 1, background: "rgba(255, 255, 255, 0.05)", borderRadius: 4, height: 24 }}>
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
          <div style={{ width: 40, fontSize: 12, fontWeight: 600 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export default async function AdminContentPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const data = await getContentData();

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Content" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Content Analytics</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Videos, lessons, programs, and engagement metrics.
        </div>
      </div>

      <AdminNav />

      {/* Video Stats */}
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 8 }}>Videos</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Total Videos</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.videos.total}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>This Month</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.videos.thisMonth}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>This Week</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.videos.thisWeek}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Comments</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.comments.total}</div>
          <div className="muted" style={{ fontSize: 11 }}>{data.comments.avgPerVideo} avg/video</div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">By Category</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ gap: 24 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{data.videos.byCategory.game}</div>
                <div className="muted" style={{ fontSize: 12 }}>Game</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{data.videos.byCategory.training}</div>
                <div className="muted" style={{ fontSize: 12 }}>Training</div>
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">By Source</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ gap: 24 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{data.videos.bySource.upload}</div>
                <div className="muted" style={{ fontSize: 12 }}>Uploaded</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{data.videos.bySource.link}</div>
                <div className="muted" style={{ fontSize: 12 }}>Links</div>
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Top Uploaders</div>
          </div>
          <div style={{ marginTop: 16 }}>
            {data.videos.topUploaders.length > 0 ? (
              <div className="stack" style={{ gap: 8 }}>
                {data.videos.topUploaders.map((u, i) => (
                  <div key={i} className="row" style={{ justifyContent: "space-between" }}>
                    <span>{u.name}</span>
                    <span style={{ fontWeight: 600 }}>{u.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No data</div>
            )}
          </div>
        </Card>
      </div>

      {/* Lesson Stats */}
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 24 }}>Lessons</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Total Lessons</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.lessons.total}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>This Week</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.lessons.thisWeek}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Upcoming</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.lessons.upcoming}</div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">By Status</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Pill variant="warning">Pending: {data.lessons.byStatus.pending}</Pill>
              <Pill variant="success">Approved: {data.lessons.byStatus.approved}</Pill>
              <Pill variant="danger">Declined: {data.lessons.byStatus.declined}</Pill>
              <Pill variant="muted">Cancelled: {data.lessons.byStatus.cancelled}</Pill>
            </div>
          </div>
        </Card>
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">By Mode</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ gap: 24 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{data.lessons.byMode.in_person}</div>
                <div className="muted" style={{ fontSize: 12 }}>In-Person</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{data.lessons.byMode.remote}</div>
                <div className="muted" style={{ fontSize: 12 }}>Remote</div>
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Popular Booking Hours</div>
          </div>
          <div style={{ marginTop: 16 }}>
            {data.lessons.popularHours.length > 0 ? (
              <BarChart
                data={data.lessons.popularHours.map((h) => ({
                  label: `${h.hour}:00`,
                  value: h.count
                }))}
                maxValue={data.lessons.popularHours[0]?.count || 1}
              />
            ) : (
              <div className="muted">No data</div>
            )}
          </div>
        </Card>
      </div>

      {/* Program Stats */}
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 24 }}>Programs</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Total Programs</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.programs.total}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Total Enrollments</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.programs.totalEnrollments}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="muted" style={{ fontSize: 12 }}>Active Enrollments</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "var(--success, #4ade80)" }}>
            {data.programs.activeEnrollments}
          </div>
        </Card>
      </div>
    </div>
  );
}

