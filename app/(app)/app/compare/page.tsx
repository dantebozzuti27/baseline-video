import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Card, LinkButton } from "@/components/ui";
import VideoClient from "../../videos/[id]/videoClient";

export default async function ComparePage({
  searchParams
}: {
  searchParams: { left?: string; right?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getMyProfile();
  if (!profile) redirect("/onboarding");
  if (profile.role !== "coach") redirect("/app");

  const left = searchParams.left ?? "";
  const right = searchParams.right ?? "";

  const { data: vids } = await supabase
    .from("videos")
    .select("id, title, created_at, owner_user_id, is_library")
    .eq("team_id", profile.team_id)
    .is("deleted_at", null)
    .order("is_library", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const ownerIds = Array.from(new Set((vids ?? []).map((v: any) => v.owner_user_id).filter(Boolean)));
  const { data: owners } = ownerIds.length
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds)
    : { data: [] as any[] };
  const ownerMap = new Map<string, string>();
  for (const o of owners ?? []) ownerMap.set(o.user_id, o.display_name);

  const library = (vids ?? []).filter((v: any) => v.is_library);
  const rest = (vids ?? []).filter((v: any) => !v.is_library);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Compare</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Side-by-side review.
          </div>
        </div>
        <LinkButton href="/app/dashboard">Back</LinkButton>
      </div>

      <Card>
        <div className="muted" style={{ fontSize: 13 }}>
          Pick two videos (library or any player) to review side-by-side.
        </div>
        <form className="stack" style={{ marginTop: 12 }} action="/app/compare" method="get">
          <div className="row" style={{ alignItems: "end" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="label">Left</div>
              <select className="select" name="left" defaultValue={left}>
                <option value="">Select a video…</option>
                {library.length ? <optgroup label="Library" /> : null}
                {library.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.title} • {ownerMap.get(v.owner_user_id) ?? "Team"} • {new Date(v.created_at).toLocaleDateString()}
                  </option>
                ))}
                {rest.length ? <optgroup label="Team (recent)" /> : null}
                {rest.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.title} • {ownerMap.get(v.owner_user_id) ?? "Player"} • {new Date(v.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="label">Right</div>
              <select className="select" name="right" defaultValue={right}>
                <option value="">Select a video…</option>
                {library.length ? <optgroup label="Library" /> : null}
                {library.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.title} • {ownerMap.get(v.owner_user_id) ?? "Team"} • {new Date(v.created_at).toLocaleDateString()}
                  </option>
                ))}
                {rest.length ? <optgroup label="Team (recent)" /> : null}
                {rest.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.title} • {ownerMap.get(v.owner_user_id) ?? "Player"} • {new Date(v.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <button className="btn btnPrimary" type="submit">
              Compare
            </button>
          </div>
        </form>
      </Card>

      {left && right ? (
        <div className="row" style={{ alignItems: "stretch" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <VideoClient videoId={left} />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <VideoClient videoId={right} />
          </div>
        </div>
      ) : null}
    </div>
  );
}


