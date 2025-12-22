import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { redirect } from "next/navigation";
import { LocalDateTime } from "@/components/LocalDateTime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button, Card } from "@/components/ui";
import VideoClient from "./videoClient";
import CommentForm from "./commentForm";

export default async function VideoDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: video } = await supabase
    .from("videos")
    .select("id, title, category, created_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!video) redirect("/app");

  const { data: comments } = await supabase
    .from("comments")
    .select("id, body, timestamp_seconds, created_at, author_user_id")
    .eq("video_id", params.id)
    .order("created_at", { ascending: true });

  const authorIds = Array.from(new Set((comments ?? []).map((c) => c.author_user_id)));
  const { data: authors } = authorIds.length
    ? await supabase.from("profiles").select("user_id, display_name, role").in("user_id", authorIds)
    : { data: [] as any[] };

  const authorMap = new Map<string, { display_name: string; role: string }>();
  for (const a of authors ?? []) authorMap.set(a.user_id, { display_name: a.display_name, role: a.role });

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{video.title}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            {video.category.toUpperCase()} • {<LocalDateTime value={video.created_at} />}
          </div>
        </div>
        <LinkButton href="/app">Back</LinkButton>
      </div>

      <VideoClient videoId={video.id} />

      <div className="stack" style={{ gap: 10 }}>
        <div style={{ fontWeight: 900 }}>Comments</div>
        {comments && comments.length > 0 ? (
          <div className="stack">
            {comments.map((c) => {
              const author = authorMap.get(c.author_user_id);
              const label = author ? `${author.display_name} (${String(author.role).toUpperCase()})` : "User";
              return (
                <div key={c.id} className="card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{label}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {<LocalDateTime value={c.created_at} />}
                    </div>
                  </div>
                  {c.timestamp_seconds !== null ? (
                    <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                      @{c.timestamp_seconds}s
                    </div>
                  ) : null}
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{c.body}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card>
            <div className="muted">No comments yet.</div>
          </Card>
        )}
      </div>

      <CommentForm videoId={video.id} />
    </div>
  );
}


