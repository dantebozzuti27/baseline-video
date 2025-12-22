import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Card, LinkButton } from "@/components/ui";
import { LocalDateTime } from "@/components/LocalDateTime";

export default async function AuditPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app");

  const supabase = createSupabaseServerClient();

  const { data: events, error } = await supabase
    .from("events")
    .select("id, action, entity_type, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Audit log</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Last 50 actions (coach-only).
          </div>
        </div>
        <LinkButton href="/app/settings">Back</LinkButton>
      </div>

      {error ? (
        <Card>
          <div style={{ color: "var(--danger)", fontWeight: 800 }}>Unable to load audit log</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Please try again in a moment.
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="stack">
          {(events ?? []).map((e: any) => (
            <div key={e.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800 }}>
                  {e.action} • {e.entity_type}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  <LocalDateTime value={e.created_at} />
                </div>
              </div>
              {e.entity_id ? <div className="pill">{String(e.entity_id).slice(0, 8)}</div> : null}
            </div>
          ))}
          {events && events.length === 0 ? <div className="muted">No events yet.</div> : null}
        </div>
      </Card>
    </div>
  );
}
