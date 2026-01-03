"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { toast } from "../../../toast";

type Template = { id: string; title: string; weeks_count: number };
type Player = { user_id: string; display_name: string };
type Enrollment = {
  id: string;
  template_id: string;
  player_user_id: string;
  start_at: string;
  status: "active" | "paused" | "completed";
  created_at: string;
};

export default function EnrollmentsClient({
  templates,
  players,
  enrollments
}: {
  templates: Template[];
  players: Player[];
  enrollments: Enrollment[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = React.useState<string>(templates?.[0]?.id ?? "");
  const [playerId, setPlayerId] = React.useState<string>(players?.[0]?.user_id ?? "");
  const [startAtLocal, setStartAtLocal] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);

  const templateById = React.useMemo(() => {
    const m: Record<string, Template> = {};
    for (const t of templates) m[t.id] = t;
    return m;
  }, [templates]);

  const playerById = React.useMemo(() => {
    const m: Record<string, Player> = {};
    for (const p of players) m[p.user_id] = p;
    return m;
  }, [players]);

  async function enroll() {
    if (!templateId || !playerId) return;
    setLoading(true);
    try {
      const startAt = startAtLocal ? new Date(startAtLocal).toISOString() : undefined;
      const resp = await fetch("/api/programs/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, playerUserId: playerId, startAt })
      });
      if (resp.ok) toast("Player enrolled.");
      router.refresh();
    } catch (e) {
      console.error("enroll failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(id: string, status: Enrollment["status"]) {
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/enrollments/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (resp.ok) toast("Updated.");
      router.refresh();
    } catch (e) {
      console.error("set status failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 980 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Program enrollments</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Enroll players into a shared template. Each player has a rolling Week 1 start.
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs">
            Templates
          </Link>
          <Link className="btn" href="/app/programs/feed">
            Feed
          </Link>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Enroll a player</div>
            <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 260, flex: 1 }}>
                <Select
                  label="Program template"
                  name="template"
                  value={templateId}
                  onChange={setTemplateId}
                  options={templates.map((t) => ({ value: t.id, label: `${t.title} (${t.weeks_count}w)` }))}
                />
              </div>
              <div style={{ minWidth: 260, flex: 1 }}>
                <Select
                  label="Player"
                  name="player"
                  value={playerId}
                  onChange={setPlayerId}
                  options={players.map((p) => ({ value: p.user_id, label: p.display_name }))}
                />
              </div>
              <div style={{ minWidth: 240 }}>
                <Input label="Start date" name="startAt" type="datetime-local" value={startAtLocal} onChange={setStartAtLocal} />
              </div>
              <Button variant="primary" onClick={enroll} disabled={loading || !templateId || !playerId}>
                {loading ? "Working…" : "Enroll"}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Current enrollments</div>
            {(enrollments ?? []).length ? (
              <div className="stack" style={{ gap: 10 }}>
                {enrollments.map((e) => {
                  const t = templateById[e.template_id];
                  const p = playerById[e.player_user_id];
                  return (
                    <div key={e.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{p?.display_name ?? "Player"}</div>
                        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                          {t?.title ?? "Program"} • {String(e.status).toUpperCase()}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Link className="btn" href={`/app/programs/enrollments/${e.id}`}>
                          Edit weeks
                        </Link>
                        {e.status !== "active" ? (
                          <Button onClick={() => setStatus(e.id, "active")} disabled={loading}>
                            Activate
                          </Button>
                        ) : (
                          <Button onClick={() => setStatus(e.id, "paused")} disabled={loading}>
                            Pause
                          </Button>
                        )}
                        <Button onClick={() => setStatus(e.id, "completed")} disabled={loading}>
                          Complete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                No enrollments yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}


