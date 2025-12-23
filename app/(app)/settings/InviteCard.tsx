"use client";

import * as React from "react";
import { Button, Card } from "@/components/ui";
import { toast } from "../toast";
function siteOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}

export default function InviteCard() {
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function loadInvite() {
    try {
      const resp = await fetch("/api/team/invite", { method: "GET" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to load invites");
      setToken((json as any).token ?? null);
    } catch {
      // best-effort
    }
  }

  React.useEffect(() => {
    loadInvite();
  }, []);

  const inviteUrl = token ? `${siteOrigin()}/join/${token}` : null;

  return (
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontWeight: 900 }}>Invite players</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Share this link to add players to your team. It does not expire.
          </div>
        </div>

        {inviteUrl ? (
          <div className="card">
            <div className="label">Invite URL</div>
            <div style={{ marginTop: 6, fontWeight: 800, wordBreak: "break-all" }}>{inviteUrl}</div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Tip: copy + text it to a player.
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
        )}

        {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}

        <div className="row" style={{ alignItems: "center" }}>
          <Button
            variant="primary"
            onClick={async () => {
              if (!inviteUrl) return;
              setLoading(true);
              setError(null);
              try {
                await navigator.clipboard.writeText(inviteUrl);
                toast("Invite link copied.");
              } catch {
                // ignore
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading || !inviteUrl}
          >
            Copy invite link
          </Button>
          <Button onClick={loadInvite} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>
    </Card>
  );
}
