import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Card } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import InviteCard from "../../settings/InviteCard";
import RosterCard from "../../settings/RosterCard";
import ProfileClient from "../../profile/ProfileClient";

export default async function SettingsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const players =
    profile.role === "coach"
      ? (
          await supabase
            .from("profiles")
            .select("user_id, display_name, role, is_active")
            .eq("team_id", profile.team_id)
            .eq("role", "player")
            .order("display_name", { ascending: true })
        ).data
      : [];

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: profile.role === "coach" ? "Dashboard" : "Feed", href: profile.role === "coach" ? "/app/dashboard" : "/app" },
          { label: "Settings" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Settings</div>
        <div className="muted" style={{ marginTop: 6 }}>
          {profile.role === "coach"
            ? "Manage your profile, invites, and team roster."
            : "Manage your profile and account."}
        </div>
      </div>

      {/* Profile Section */}
      <Card className="cardInteractive">
        <div className="cardHeader">
          <div className="cardTitle">Profile</div>
          <div className="cardSubtitle">Your personal information</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <ProfileClient
            initialFirstName={profile.first_name ?? ""}
            initialLastName={profile.last_name ?? ""}
            email={user.email ?? ""}
            role={profile.role}
          />
        </div>
      </Card>

      {profile.role === "coach" && (
        <>
          {/* Invite Section */}
          <Card className="cardInteractive">
            <div className="cardHeader">
              <div className="cardTitle">Team Invite</div>
              <div className="cardSubtitle">Share this link to invite players</div>
            </div>
            <div style={{ marginTop: 16 }}>
              <InviteCard />
            </div>
          </Card>

          {/* Roster Section */}
          <Card className="cardInteractive">
            <div className="cardHeader">
              <div className="cardTitle">Team Roster</div>
              <div className="cardSubtitle">Manage your players</div>
            </div>
            <div style={{ marginTop: 16 }}>
              <RosterCard players={(players ?? []) as any} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}


