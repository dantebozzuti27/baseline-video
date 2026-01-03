import { redirect } from "next/navigation";
import { Card, Pill } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EmptyState } from "@/components/EmptyState";
import { LocalDateTime } from "@/components/LocalDateTime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import RestoreVideoButton from "../../trash/RestoreVideoButton";
import PurgeVideoButton from "../../trash/PurgeVideoButton";

export default async function TrashPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  const supabase = createSupabaseServerClient();

  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, category, created_at, deleted_at, is_library, pinned")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(60);

  const isCoach = profile.role === "coach";

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: isCoach ? "Dashboard" : "Feed", href: isCoach ? "/app/dashboard" : "/app" },
          { label: "Trash" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Trash</div>
        <div className="muted" style={{ marginTop: 6 }}>
          {videos?.length ?? 0} deleted videos • Restore mistakes or permanently delete
        </div>
      </div>

      {videos && videos.length > 0 ? (
        <div className="stack bvStagger">
          {videos.map((v: any) => (
            <Card key={v.id} className="cardInteractive">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 800 }}>{v.title}</div>
                  <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: "wrap" }}>
                    <Pill>{String(v.category).toUpperCase()}</Pill>
                    {v.is_library && <Pill variant="info">LIBRARY</Pill>}
                    {v.pinned && <Pill variant="success">PINNED</Pill>}
                  </div>
                  <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                    Deleted <LocalDateTime value={v.deleted_at} /> • Uploaded <LocalDateTime value={v.created_at} />
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <RestoreVideoButton videoId={v.id} />
                  <PurgeVideoButton videoId={v.id} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          variant="trash"
          title="Trash is empty"
          message="When you delete a video, it will appear here so you can restore it if needed."
        />
      )}
    </div>
  );
}


