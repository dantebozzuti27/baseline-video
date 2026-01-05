import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import AdminNav from "../AdminNav";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const admin = createSupabaseAdminClient();

  // Get all profiles with team info
  const { data: profiles } = await admin
    .from("profiles")
    .select(`
      user_id,
      display_name,
      role,
      is_active,
      is_admin,
      player_mode,
      team_id,
      created_at,
      teams:team_id (name)
    `)
    .order("created_at", { ascending: false });

  // Get video counts per user
  const { data: videoCounts } = await admin
    .from("videos")
    .select("uploader_id")
    .then((res) => {
      if (!res.data) return { data: {} };
      const counts: Record<string, number> = {};
      res.data.forEach((v: any) => {
        counts[v.uploader_id] = (counts[v.uploader_id] || 0) + 1;
      });
      return { data: counts };
    });

  // Get lesson counts per user
  const { data: lessonCounts } = await admin
    .from("lesson_participants")
    .select("user_id")
    .then((res) => {
      if (!res.data) return { data: {} };
      const counts: Record<string, number> = {};
      res.data.forEach((lp: any) => {
        counts[lp.user_id] = (counts[lp.user_id] || 0) + 1;
      });
      return { data: counts };
    });

  const users = (profiles || []).map((p: any) => ({
    user_id: p.user_id,
    display_name: p.display_name,
    role: p.role,
    is_active: p.is_active,
    is_admin: p.is_admin,
    player_mode: p.player_mode,
    team_name: p.teams?.name || "—",
    video_count: videoCounts?.[p.user_id] || 0,
    lesson_count: lessonCounts?.[p.user_id] || 0,
    created_at: p.created_at
  }));

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Users" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Users</div>
        <div className="muted" style={{ marginTop: 6 }}>
          All registered users ({users.length} total)
        </div>
      </div>

      <AdminNav />

      <UsersClient users={users} />
    </div>
  );
}

