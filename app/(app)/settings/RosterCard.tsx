"use client";

import * as React from "react";
import { Button, Card } from "@/components/ui";

export default function RosterCard({
  players
}: {
  players: Array<{ user_id: string; display_name: string; is_active?: boolean }>;
}) {
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  async function setActive(userId: string, active: boolean) {
    const ok = window.confirm(active ? "Reactivate this player?" : "Deactivate this player?");
    if (!ok) return;

    setLoadingId(userId);
    try {
      const resp = await fetch("/api/team/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, active })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to update player");
      window.location.reload();
    } catch (e: any) {
      console.error("update player active failed", e);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontWeight: 900 }}>Roster</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Deactivated players can’t access the app.
          </div>
        </div>

        <div className="stack">
          {players.map((p) => {
            const active = p.is_active !== false;
            return (
              <div key={p.user_id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{p.display_name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {active ? "Active" : "Inactive"}
                  </div>
                </div>
                <Button
                  variant={active ? "danger" : "primary"}
                  disabled={loadingId === p.user_id}
                  onClick={() => setActive(p.user_id, !active)}
                >
                  {loadingId === p.user_id ? "Working…" : active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
