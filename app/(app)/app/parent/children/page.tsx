import { redirect } from "next/navigation";
import Link from "next/link";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Card, Pill } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ChevronRight, Video, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ParentChildrenPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "parent") redirect("/app");

  const admin = createSupabaseAdminClient();

  // Get linked children with access levels
  const { data: links } = await admin
    .from("parent_player_links")
    .select("player_user_id, access_level, created_at")
    .eq("parent_user_id", profile.user_id);

  const playerIds = links?.map((l) => l.player_user_id) || [];

  // Get children profiles with their team info
  const { data: children } = playerIds.length > 0
    ? await admin
        .from("profiles")
        .select(`
          user_id,
          display_name,
          first_name,
          last_name,
          team_id,
          teams:team_id (name)
        `)
        .in("user_id", playerIds)
    : { data: [] };

  // Get video counts per child
  const { data: videoCounts } = playerIds.length > 0
    ? await admin
        .from("videos")
        .select("owner_user_id")
        .in("owner_user_id", playerIds)
    : { data: [] };

  const videoCountMap: Record<string, number> = {};
  videoCounts?.forEach((v: any) => {
    videoCountMap[v.owner_user_id] = (videoCountMap[v.owner_user_id] || 0) + 1;
  });

  // Get lesson counts per child
  const { data: lessonCounts } = playerIds.length > 0
    ? await admin
        .from("lesson_participants")
        .select("user_id")
        .in("user_id", playerIds)
    : { data: [] };

  const lessonCountMap: Record<string, number> = {};
  lessonCounts?.forEach((l: any) => {
    lessonCountMap[l.user_id] = (lessonCountMap[l.user_id] || 0) + 1;
  });

  // Combine data
  const childrenWithStats = children?.map((child: any) => {
    const link = links?.find((l) => l.player_user_id === child.user_id);
    return {
      ...child,
      accessLevel: link?.access_level || "view_only",
      videoCount: videoCountMap[child.user_id] || 0,
      lessonCount: lessonCountMap[child.user_id] || 0,
      teamName: child.teams?.name || "Unknown Team"
    };
  }) || [];

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/app/parent" },
          { label: "Children" }
        ]}
      />

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
          Your Children
        </h1>
        <p className="muted">
          View your linked children and their activity.
        </p>
      </div>

      {childrenWithStats.length > 0 ? (
        <div className="stack">
          {childrenWithStats.map((child) => (
            <Card key={child.user_id} className="cardInteractive">
              <Link href={`/app/parent/children/${child.user_id}`} style={{ textDecoration: "none" }}>
                <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <div className="row" style={{ alignItems: "center", gap: 16 }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        background: "var(--primary)",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 22,
                        fontWeight: 700
                      }}
                    >
                      {child.first_name?.[0] || child.display_name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{child.display_name}</div>
                      <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                        {child.teamName}
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 8 }}>
                        <Pill variant={child.accessLevel === "full" ? "success" : "muted"}>
                          {child.accessLevel === "full" ? "Full Access" : "View Only"}
                        </Pill>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={24} className="muted" />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    marginTop: 16,
                    paddingTop: 16,
                    borderTop: "1px solid var(--border)"
                  }}
                >
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <Video size={18} className="muted" />
                    <span style={{ fontWeight: 600 }}>{child.videoCount}</span>
                    <span className="muted">videos</span>
                  </div>
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <Calendar size={18} className="muted" />
                    <span style={{ fontWeight: 600 }}>{child.lessonCount}</span>
                    <span className="muted">lessons</span>
                  </div>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👨‍👩‍👧</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              No Children Linked
            </h2>
            <p className="muted" style={{ maxWidth: 400, margin: "0 auto" }}>
              Your coach will link your account to your child's profile. 
              Contact your coach if you haven't been connected yet.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

