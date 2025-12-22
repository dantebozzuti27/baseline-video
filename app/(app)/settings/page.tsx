import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { LinkButton } from "@/components/ui";
import InviteCard from "./InviteCard";
import RosterCard from "./RosterCard";
import ProfileClient from "../profile/ProfileClient";

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
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Account & team</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Manage your account. Coaches also manage invites and roster.
          </div>
        </div>
        <LinkButton href={profile.role === "coach" ? "/app/dashboard" : "/app"}>Back</LinkButton>
      </div>

      <ProfileClient
        initialFirstName={profile.first_name ?? ""}
        initialLastName={profile.last_name ?? ""}
        email={user.email ?? ""}
        role={profile.role}
      />

      {profile.role === "coach" ? (
        <>
          <InviteCard />
          <RosterCard players={(players ?? []) as any} />
        </>
      ) : null}
    </div>
  );
}
