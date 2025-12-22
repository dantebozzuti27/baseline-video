import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { redirect } from "next/navigation";
import { LocalDateTime } from "@/components/LocalDateTime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import type { VideoCategory } from "@/lib/db/types";
import { Card } from "@/components/ui";
import { displayNameFromProfile } from "@/lib/utils/name";

export default async function PlayerPage({
  params,
  searchParams
}: {
  params: { userId: string };
  searchParams: { cat?: string; sort?: string };
}) {
  const myProfile = await getMyProfile();
  if (!myProfile) redirect("/sign-in");
  if (myProfile.role !== "coach") redirect("/app");

  const supabase = createSupabaseServerClient();
  const { data: player } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name, display_name, role")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!player || player.role !== "player") redirect("/app/dashboard");

  const category = (searchParams.cat ?? "all") as "all" | VideoCategory;
  const sort = searchParams.sort === "oldest" ? "oldest" : "recent";

  let query = supabase
    .from("videos")
    .select("id, title, category, created_at")
    .eq("owner_user_id", params.userId)
    .order("created_at", { ascending: sort === "oldest" });
  if (category !== "all") query = query.eq("category", category);

  const { data: videos } = await query;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{displayNameFromProfile(player as any)}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Player videos
          </div>
        </div>
        <div className="row">
          <LinkButton href="/app/dashboard">Back</LinkButton>
        </div>
      </div>

      <Card>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row">
            <Link className="pill" href={`/app/player/${params.userId}?cat=all&sort=${sort}`}>
              All
            </Link>
            <Link className="pill" href={`/app/player/${params.userId}?cat=game&sort=${sort}`}>
              Game
            </Link>
            <Link className="pill" href={`/app/player/${params.userId}?cat=training&sort=${sort}`}>
              Training
            </Link>
          </div>
          <div className="row">
            <Link className="pill" href={`/app/player/${params.userId}?cat=${category}&sort=recent`}>
              Recent
            </Link>
            <Link className="pill" href={`/app/player/${params.userId}?cat=${category}&sort=oldest`}>
              Oldest
            </Link>
          </div>
        </div>
      </Card>

      {videos && videos.length > 0 ? (
        <div className="stack">
          {videos.map((v) => (
            <Link key={v.id} href={`/app/videos/${v.id}`}>
              <div className="card">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>{v.title}</div>
                  <div className="pill">{String(v.category).toUpperCase()}</div>
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  {<LocalDateTime value={v.created_at} />}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <div className="muted">No videos yet.</div>
        </Card>
      )}
    </div>
  );
}


