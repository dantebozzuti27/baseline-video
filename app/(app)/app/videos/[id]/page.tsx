import { redirect } from "next/navigation";
import { LocalDateTime } from "@/components/LocalDateTime";
import { LinkButton, Card } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Avatar } from "@/components/Avatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { displayNameFromProfile } from "@/lib/utils/name";
import VideoClient from "../../../videos/[id]/videoClient";
import CommentForm from "../../../videos/[id]/commentForm";
import DeleteVideoButton from "../../../videos/[id]/DeleteVideoButton";
import DeleteCommentButton from "../../../videos/[id]/DeleteCommentButton";
import PinLibraryControls from "../../../videos/[id]/PinLibraryControls";
import CompareQuick from "../../../videos/[id]/CompareQuick";
import ShareVideoButton from "../../../videos/[id]/ShareVideoButton";

export default async function VideoDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const myProfile = await getMyProfile();

  const { data: video } = await supabase
    .from("videos")
    .select("id, title, category, created_at, uploader_user_id, owner_user_id, pinned, is_library, deleted_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!video) redirect(myProfile?.role === "coach" ? "/app/dashboard" : "/app");
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
  const visibilityBadge = (video as any).is_library ? "LIBRARY" : isCoach ? (video as any).owner_user_id === user.id ? "COACH-SHARED" : "PRIVATE" : (video as any).owner_user_id === user.id ? "PRIVATE" : "COACH-SHARED";
  const visibleToLabel =
    (video as any).is_library
      ? "Team"
      : isCoach
        ? (video as any).owner_user_id === user.id
          ? "Team"
          : "Coach + player"
        : (video as any).owner_user_id === user.id
          ? "You + your coach"
          : "Team";

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: isCoach ? "Dashboard" : "Feed", href: isCoach ? "/app/dashboard" : "/app" },
          { label: video.title }
        ]}
      />

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{video.title}</div>
          <div className="row" style={{ marginTop: 8, gap: 8, alignItems: "center" }}>
            <div className="pill">{video.category.toUpperCase()}</div>
            <div className={visibilityBadge === "LIBRARY" ? "pill pillInfo" : visibilityBadge === "COACH-SHARED" ? "pill pillWarning" : "pill"}>
              {visibilityBadge}
            </div>
            <span className="muted" style={{ fontSize: 13 }}>
              <LocalDateTime value={video.created_at} />
            </span>
          </div>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <ShareVideoButton videoId={video.id} />
        </div>
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
          <div className="stack bvStagger">
            {comments.map((c) => {
              const author = authorMap.get(c.author_user_id);
              const authorName = author ? displayNameFromProfile(author) : "User";
              const authorRole = author?.role ?? "user";
              const canDeleteComment = isCoach || c.author_user_id === user.id;

              return (
                <div key={c.id} className="card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="row" style={{ alignItems: "center", gap: 10 }}>
                      <Avatar name={authorName} size="sm" />
                      <div>
                        <div style={{ fontWeight: 800 }}>{authorName}</div>
                        <div className={authorRole === "coach" ? "pill pillInfo" : "pill"} style={{ marginTop: 4 }}>
                          {String(authorRole).toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ alignItems: "center", gap: 8 }}>
                      {c.visibility === "player_private" && <div className="pill pillMuted">PRIVATE</div>}
                      {c.visibility === "coach_only" && <div className="pill pillWarning">COACH NOTE</div>}
                      <div className="muted" style={{ fontSize: 12 }}>
                        <LocalDateTime value={c.created_at} />
                      </div>
                      {canDeleteComment && <DeleteCommentButton commentId={c.id} />}
                    </div>
                  </div>
                  {c.timestamp_seconds !== null && (
                    <div style={{ marginTop: 8 }}>
                      <a href={`#t=${c.timestamp_seconds}`} className="pill pillSuccess">@{c.timestamp_seconds}s</a>
                    </div>
                  )}
                  <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.body}</div>
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
