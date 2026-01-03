"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Modal } from "@/components/ui";
import { toast } from "../toast";

export default function RosterCard({
  players
}: {
  players: Array<{ user_id: string; display_name: string; is_active?: boolean }>;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{ userId: string; nextActive: boolean } | null>(null);

  async function setActive(userId: string, active: boolean) {
    setConfirm({ userId, nextActive: active });
  }

  async function doSetActive() {
    if (!confirm) return;
    const userId = confirm.userId;
    const active = confirm.nextActive;
    setLoadingId(userId);
    try {
      const resp = await fetch("/api/team/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, active })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to update player");
      toast(active ? "Player reactivated." : "Player deactivated.");
      router.refresh();
    } catch (e: any) {
      console.error("update player active failed", e);
    } finally {
      setLoadingId(null);
      setConfirm(null);
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
            const isWorking = loadingId === p.user_id;
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
                  disabled={isWorking}
                  onClick={() => setActive(p.user_id, !active)}
                >
                  {isWorking ? "Working…" : active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            );
          })}
        </div>

        <Modal
          open={Boolean(confirm)}
          title={confirm?.nextActive ? "Reactivate player" : "Deactivate player"}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)} disabled={Boolean(loadingId)}>
                Cancel
              </Button>
              <Button
                variant={confirm?.nextActive ? "primary" : "danger"}
                onClick={doSetActive}
                disabled={Boolean(loadingId)}
              >
                {confirm?.nextActive ? "Reactivate" : "Deactivate"}
              </Button>
            </>
          }
        >
          <div className="muted" style={{ fontSize: 13 }}>
            {confirm?.nextActive ? "This player will regain access to the app." : "This player won’t be able to access the app."}
          </div>
        </Modal>
      </div>
    </Card>
  );
}
