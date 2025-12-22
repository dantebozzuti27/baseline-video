import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { redirect } from "next/navigation";
import { LocalDateTime } from "@/components/LocalDateTime";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { VideoCategory } from "@/lib/db/types";
import { Card, Button } from "@/components/ui";

export default async function AppHomePage({
  searchParams
}: {
  searchParams: { cat?: string; sort?: string };
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-up");

  if (profile.role === "coach") {
    redirect("/app/dashboard");
  }

  const category = (searchParams.cat ?? "all") as "all" | VideoCategory;
  const sort = searchParams.sort === "oldest" ? "oldest" : "recent";

  const supabase = createSupabaseServerClient();
  let query = supabase.from("videos").select("id, title, category, created_at").order("created_at", {
    ascending: sort === "oldest"
  });
  if (category !== "all") query = query.eq("category", category);

  const { data: videos } = await query;

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Your videos</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Upload, filter, and review.
          </div>
        </div>
        <LinkButton href="/app/upload" variant="primary">Upload</LinkButton>
      </div>

      <Card>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row">
            <Link className="pill" href={`/app?cat=all&sort=${sort}`}>
              All
            </Link>
            <Link className="pill" href={`/app?cat=game&sort=${sort}`}>
              Game
            </Link>
            <Link className="pill" href={`/app?cat=training&sort=${sort}`}>
              Training
            </Link>
          </div>
          <div className="row">
            <Link className="pill" href={`/app?cat=${category}&sort=recent`}>
              Recent
            </Link>
            <Link className="pill" href={`/app?cat=${category}&sort=oldest`}>
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
          <div style={{ fontWeight: 800 }}>No videos yet</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Upload your first Game or Training clip.
          </div>
          <div style={{ marginTop: 12 }}>
            <LinkButton href="/app/upload" variant="primary">Upload</LinkButton>
          </div>
        </Card>
      )}
    </div>
  );
}


