import { redirect } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { LocalDateTime } from "@/components/LocalDateTime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import RestoreVideoButton from "./RestoreVideoButton";
import PurgeVideoButton from "./PurgeVideoButton";

export default async function TrashPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  const supabase = createSupabaseServerClient();

  // RLS should constrain this to either: (player) own deleted videos, or (coach) team deleted videos.
  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, category, created_at, deleted_at, is_library, pinned")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(60);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Trash</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Restore mistakes fast. (Requires `0009_soft_deletes_trash.sql` migration.)
          </div>
        </div>
        <LinkButton href={profile.role === "coach" ? "/app/dashboard" : "/app"}>Back</LinkButton>
      </div>

      {videos && videos.length > 0 ? (
        <div className="stack">
          {videos.map((v: any) => (
            <div key={v.id} className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 900 }}>{v.title}</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Deleted: <LocalDateTime value={v.deleted_at} />
                  </div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Uploaded: <LocalDateTime value={v.created_at} />
                  </div>
                  <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
                    <div className="pill">{String(v.category).toUpperCase()}</div>
                    {v.is_library ? <div className="pill">LIBRARY</div> : null}
                    {v.pinned ? <div className="pill">PINNED</div> : null}
                  </div>
                </div>
                <div className="stack" style={{ gap: 10 }}>
                  <RestoreVideoButton videoId={v.id} />
                  <PurgeVideoButton videoId={v.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <div style={{ fontWeight: 800 }}>Trash is empty</div>
          <div className="muted" style={{ marginTop: 6 }}>
            When you delete a video, it will land here so you can restore it.
          </div>
        </Card>
      )}
    </div>
  );
}


