"use client";

import * as React from "react";
import { Button, Card } from "@/components/ui";
import { toast } from "../../../toast";

type PlayerMode = "in_person" | "hybrid" | "remote";

function labelFor(mode: PlayerMode) {
  return mode === "in_person" ? "In-person" : mode === "hybrid" ? "Hybrid" : "Remote";
}

export default function PlayerModeCard({
  userId,
  initialMode
}: {
  userId: string;
  initialMode: PlayerMode | null | undefined;
}) {
  const [mode, setMode] = React.useState<PlayerMode>((initialMode ?? "in_person") as PlayerMode);
  const [saving, setSaving] = React.useState(false);

  async function save(next: PlayerMode) {
    setMode(next);
    setSaving(true);
    try {
      const resp = await fetch(`/api/team/players/${userId}/mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to update player category");
      toast(`Player category set to ${labelFor(next)}`);
    } catch (e: any) {
      console.error("set player category failed", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontWeight: 900 }}>Player category</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Used for coaching workflow defaults (not permissions).
          </div>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {(["in_person", "hybrid", "remote"] as PlayerMode[]).map((m) => (
            <Button key={m} variant={mode === m ? "primary" : "default"} disabled={saving} onClick={() => save(m)}>
              {saving && mode === m ? "Saving…" : labelFor(m)}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}


