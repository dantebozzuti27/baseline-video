"use client";

import * as React from "react";
import { Button, Card } from "@/components/ui";
import { getSiteUrl } from "@/lib/utils/site";

export default function InviteCard() {
  const [token, setToken] = React.useState<string | null>(null);
  const [invites, setInvites] = React.useState<
    Array<{ id: string; token: string; expires_at: string | null; max_uses: number; uses_count: number; created_at: string }>
  >([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function loadInvites() {
    try {
      const resp = await fetch("/api/invites", { method: "GET" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to load invites");
      setInvites((json as any).invites ?? []);
    } catch {
      // best-effort
    }
  }

  React.useEffect(() => {
    loadInvites();
  }, []);

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

      const url = `${getSiteUrl()}/join/${(json as any).token}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // ignore
      }
      await loadInvites();
    } catch (e: any) {
      setError(e?.message ?? "Unable to create invite");
    } finally {
      setLoading(false);
    }
  }

  async function revokeInvite(id: string) {
    const ok = window.confirm("Revoke this invite link? It will stop working immediately.");
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to revoke invite");
      await loadInvites();
    } catch (e: any) {
      setError(e?.message ?? "Unable to revoke invite");
    } finally {
      setLoading(false);
    }
  }

  const inviteUrl = token ? `${getSiteUrl()}/join/${token}` : null;

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

        <div className="card">
          <div style={{ fontWeight: 900 }}>Active invites</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Revoke links anytime. Uses update automatically when players join.
          </div>

          {invites.length > 0 ? (
            <div className="stack" style={{ marginTop: 12 }}>
              {invites.map((inv) => {
                const url = `${getSiteUrl()}/join/${inv.token}`;
                const expired = inv.expires_at ? new Date(inv.expires_at).getTime() < Date.now() : false;
                return (
                  <div key={inv.id} className="card">
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontWeight: 800, wordBreak: "break-all" }}>{url}</div>
                        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                          {inv.expires_at ? `Expires: ${new Date(inv.expires_at).toLocaleString()}` : "No expiry"} • Uses:{" "}
                          {inv.uses_count}/{inv.max_uses}
                          {expired ? " • EXPIRED" : ""}
                        </div>
                      </div>
                      <div className="row" style={{ alignItems: "center" }}>
                        <Button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(url);
                            } catch {
                              // ignore
                            }
                          }}
                          disabled={loading}
                        >
                          Copy
                        </Button>
                        <Button variant="danger" onClick={() => revokeInvite(inv.id)} disabled={loading}>
                          Revoke
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 12 }}>
              No active invites yet.
            </div>
          )}
        </div>

        {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}

        <Button variant="primary" onClick={createInvite} disabled={loading}>
          {loading ? "Creating…" : token ? "Create another invite" : "Create invite link"}
        </Button>
      </div>
    </Card>
  );
}
