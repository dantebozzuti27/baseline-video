import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Card, LinkButton } from "@/components/ui";

export default async function SettingsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app");

  const supabase = createSupabaseServerClient();

  const { data: players } = await supabase
    .from("profiles")
    .select("user_id, display_name, role")
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

      <Card>
        <div style={{ fontWeight: 900 }}>Roster (read-only for now)</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          In this sprint we’re shipping the core coach workflow first. Next: deactivate/remove players.
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          {(players ?? []).map((p: any) => (
            <div key={p.user_id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>{p.display_name}</div>
              <div className="pill">PLAYER</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 900 }}>Retention</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Next: auto-archive/delete policies for storage cost control.
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 900 }}>Notifications</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Next: low-noise email digest when players upload.
        </div>
      </Card>
    </div>
  );
}
