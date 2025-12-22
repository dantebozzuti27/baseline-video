"use client";

import * as React from "react";
import { Button, Card } from "@/components/ui";

export default function InviteCard() {
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function createInvite() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresMinutes: 60 * 24 * 7 })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to create invite");
      setToken((json as any).token);

      const url = `${window.location.origin}/join/${(json as any).token}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // ignore
      }
    } catch (e: any) {
      setError(e?.message ?? "Unable to create invite");
    } finally {
      setLoading(false);
    }
  }

  const inviteUrl = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${token}` : null;

  return (
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontWeight: 900 }}>Invite link</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Create a link you can text to a player. It expires in 7 days.
          </div>
        </div>

        {token ? (
          <div className="card">
            <div className="label">Invite URL</div>
            <div style={{ marginTop: 6, fontWeight: 800, wordBreak: "break-all" }}>{inviteUrl}</div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Copied to clipboard (if your browser allowed it).
            </div>
          </div>
        ) : null}

        {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}

        <Button variant="primary" onClick={createInvite} disabled={loading}>
          {loading ? "Creating…" : token ? "Create another invite" : "Create invite link"}
        </Button>
      </div>
    </Card>
  );
}
