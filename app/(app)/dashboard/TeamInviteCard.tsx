"use client";

import * as React from "react";
import { Button, Card } from "@/components/ui";
import { toast } from "../toast";

function siteOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}

export default function TeamInviteCard() {
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const resp = await fetch("/api/team/invite", { method: "GET" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to load invite");
      setToken((json as any).token as string);
    } catch (e: any) {
      setError(e?.message ?? "Unable to load invite");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  const inviteUrl = token ? `${siteOrigin()}/join/${token}` : null;

  return (
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontWeight: 900 }}>Invite players</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            This is your team’s permanent invite link. Share it to add players.
          </div>
        </div>

        {inviteUrl ? (
          <div className="card">
            <div className="label">Invite URL</div>
            <div style={{ marginTop: 6, fontWeight: 800, wordBreak: "break-all" }}>{inviteUrl}</div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              {copied ? "Copied to clipboard." : "Anyone with this link can join your team."}
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>{loading ? "Loading…" : "Invite not loaded yet."}</div>
        )}

        {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}

        <div className="row" style={{ alignItems: "center" }}>
          <Button
            variant="primary"
            onClick={async () => {
              if (!inviteUrl) return;
              try {
                await navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
                toast("Invite link copied.");
              } catch {
                // ignore
              }
            }}
            disabled={loading || !inviteUrl}
          >
            Copy invite link
          </Button>
          <Button onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>
    </Card>
  );
}


