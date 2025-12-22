import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { LinkButton } from "@/components/ui";
import InviteCard from "./InviteCard";
import RosterCard from "./RosterCard";

export default async function SettingsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app");

  const supabase = createSupabaseServerClient();

  const { data: players } = await supabase
    .from("profiles")
    .select("user_id, display_name, role, is_active")
    .eq("team_id", profile.team_id)
    .eq("role", "player")
    .order("display_name", { ascending: true });

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Team settings</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Coach-only.
          </div>
        </div>
        <LinkButton href="/app/dashboard">Back</LinkButton>
      </div>

      <InviteCard />
      <RosterCard players={(players ?? []) as any} />
    </div>
  );
}
