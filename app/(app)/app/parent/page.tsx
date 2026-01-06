import { redirect } from "next/navigation";
import Link from "next/link";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui";
import { Video, Calendar, Users, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils/datetime";

export const dynamic = "force-dynamic";

export default async function ParentDashboard() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "parent") redirect("/app");

  const admin = createSupabaseAdminClient();

  // Get linked children
  const { data: links } = await admin
    .from("parent_player_links")
    .select("player_user_id, access_level")
    .eq("parent_user_id", profile.user_id);

  const playerIds = links?.map((l) => l.player_user_id) || [];

  // Get children profiles
  const { data: children } = playerIds.length > 0
    ? await admin
        .from("profiles")
        .select("user_id, display_name, first_name, last_name")
        .in("user_id", playerIds)
    : { data: [] };

  // Get recent videos for children
  const { data: recentVideos } = playerIds.length > 0
    ? await admin
        .from("videos")
        .select("id, title, owner_user_id, created_at")
        .in("owner_user_id", playerIds)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  // Get upcoming lessons for children
  const { data: upcomingLessons } = playerIds.length > 0
    ? await admin
        .from("lesson_participants")
        .select(`
          lesson_id,
          lessons:lesson_id (
            id,
            start_at,
            duration_minutes,
            status
          )
        `)
        .in("user_id", playerIds)
        .limit(5)
    : { data: [] };

  const lessons = upcomingLessons
    ?.filter((lp: any) => lp.lessons?.status === "approved" && new Date(lp.lessons.start_at) > new Date())
    .map((lp: any) => lp.lessons) || [];

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
          Welcome back
        </h1>
        <p className="muted">
          Track your children's progress and upcoming lessons.
        </p>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <Card className="cardInteractive">
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <Users size={24} color="var(--primary)" />
            <div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>{children?.length || 0}</div>
              <div className="muted" style={{ fontSize: 12 }}>Children</div>
            </div>
          </div>
        </Card>

        <Card className="cardInteractive">
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <Video size={24} color="var(--primary)" />
            <div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>{recentVideos?.length || 0}</div>
              <div className="muted" style={{ fontSize: 12 }}>Recent Videos</div>
            </div>
          </div>
        </Card>

        <Card className="cardInteractive">
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <Calendar size={24} color="var(--primary)" />
            <div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>{lessons.length}</div>
              <div className="muted" style={{ fontSize: 12 }}>Upcoming Lessons</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Children */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Your Children</div>
          <Link href="/app/parent/children" className="btn">
            Manage
            <ChevronRight size={16} />
          </Link>
        </div>

        {children && children.length > 0 ? (
          <div className="stack" style={{ marginTop: 16 }}>
            {children.map((child: any) => (
              <Link
                key={child.user_id}
                href={`/app/parent/children/${child.user_id}`}
                className="bvListItem"
              >
                <div className="bvListItemAvatar">
                  {child.first_name?.[0] || child.display_name[0]}
                </div>
                <div className="bvListItemContent">
                  <div className="bvListItemTitle">{child.display_name}</div>
                </div>
                <ChevronRight size={18} className="muted" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ textAlign: "center", padding: "32px 16px" }}>
            No children linked yet. Ask your coach to connect your account.
          </div>
        )}
      </Card>

      {/* Recent Videos */}
      {recentVideos && recentVideos.length > 0 && (
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Recent Videos</div>
            <Link href="/app/library" className="btn">
              View All
              <ChevronRight size={16} />
            </Link>
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            {recentVideos.map((video: any) => {
              const child = children?.find((c: any) => c.user_id === video.owner_user_id);
              return (
                <Link
                  key={video.id}
                  href={`/app/videos/${video.id}`}
                  className="bvListItem"
                >
                  <div className="bvListItemContent">
                    <div className="bvListItemTitle">{video.title}</div>
                    <div className="bvListItemMeta">
                      {child?.display_name} • {formatDate(video.created_at)}
                    </div>
                  </div>
                  <ChevronRight size={18} className="muted" />
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* Upcoming Lessons */}
      {lessons.length > 0 && (
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Upcoming Lessons</div>
            <Link href="/app/lessons" className="btn">
              View Schedule
              <ChevronRight size={16} />
            </Link>
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            {lessons.map((lesson: any) => (
              <div key={lesson.id} className="bvListItem">
                <div className="bvListItemContent">
                  <div className="bvListItemTitle">
                    {formatDate(lesson.start_at, "long")}
                  </div>
                  <div className="bvListItemMeta">
                    {lesson.duration_minutes} minutes
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

