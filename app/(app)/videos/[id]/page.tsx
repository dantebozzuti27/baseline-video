import { redirect } from "next/navigation";
import { LocalDateTime } from "@/components/LocalDateTime";
import { LinkButton, Card } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { displayNameFromProfile } from "@/lib/utils/name";
import VideoClient from "./videoClient";
import CommentForm from "./commentForm";
import DeleteVideoButton from "./DeleteVideoButton";
import DeleteCommentButton from "./DeleteCommentButton";
import PinLibraryControls from "./PinLibraryControls";
import CompareQuick from "./CompareQuick";

export default async function VideoDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const myProfile = await getMyProfile();

  const { data: video } = await supabase
    .from("videos")
    .select("id, title, category, created_at, uploader_user_id, pinned, is_library, deleted_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!video) redirect("/app");
  if ((video as any).deleted_at) redirect("/app/trash");

  const { data: comments } = await supabase
    .from("comments")
    .select("id, body, timestamp_seconds, created_at, author_user_id, visibility")
    .eq("video_id", params.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const authorIds = Array.from(new Set((comments ?? []).map((c) => c.author_user_id)));
  const { data: authors } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, role")
        .in("user_id", authorIds)
    : { data: [] as any[] };

  const authorMap = new Map<string, any>();
  for (const a of authors ?? []) authorMap.set(a.user_id, a);

  const isCoach = myProfile?.role === "coach";
  const canDeleteVideo = isCoach || video.uploader_user_id === user.id;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{video.title}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            {video.category.toUpperCase()} • <LocalDateTime value={video.created_at} />
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Visible to: {(video as any).is_library ? "Team" : myProfile?.role === "coach" ? "Coach (team)" : "You + your coach"}
          </div>
        </div>
        <LinkButton href="/app">Back</LinkButton>
      </div>

      <VideoClient videoId={video.id} />

      {isCoach ? (
        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Coach controls</div>
            <CompareQuick videoId={video.id} />
            <PinLibraryControls
              videoId={video.id}
              initialPinned={Boolean((video as any).pinned)}
              initialIsLibrary={Boolean((video as any).is_library)}
            />
          </div>
        </Card>
      ) : null}

      {canDeleteVideo ? (
        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Danger zone</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Move videos to Trash so you can restore mistakes.
            </div>
            <DeleteVideoButton videoId={video.id} />
          </div>
        </Card>
      ) : null}

      <div className="stack" style={{ gap: 10 }}>
        <div style={{ fontWeight: 900 }}>Comments</div>
        {comments && comments.length > 0 ? (
          <div className="stack">
            {comments.map((c) => {
              const author = authorMap.get(c.author_user_id);
              const label = author
                ? `${displayNameFromProfile(author)} (${String(author.role).toUpperCase()})`
                : "User";
              const canDeleteComment = isCoach || c.author_user_id === user.id;

              return (
                <div key={c.id} className="card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{label}</div>
                    <div className="row" style={{ alignItems: "center" }}>
                      {c.visibility === "player_private" ? <div className="pill">PRIVATE</div> : null}
                      {c.visibility === "coach_only" ? <div className="pill">COACH NOTE</div> : null}
                      <div className="muted" style={{ fontSize: 12 }}>
                        <LocalDateTime value={c.created_at} />
                      </div>
                      {canDeleteComment ? <DeleteCommentButton commentId={c.id} /> : null}
                    </div>
                  </div>
                  {c.timestamp_seconds !== null ? (
                    <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                      <a href={`#t=${c.timestamp_seconds}`} className="pill">@{c.timestamp_seconds}s</a>
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
