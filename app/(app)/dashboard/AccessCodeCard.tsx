"use client";

import * as React from "react";
import { Button, Card } from "@/components/ui";

export default function AccessCodeCard() {
  const [accessCode, setAccessCode] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function generate() {
    if (accessCode) {
      const ok = window.confirm(
        "Generate a new access code? This will invalidate the previous code and players will need the new one."
      );
      if (!ok) return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const resp = await fetch("/api/team/access-code", { method: "POST" });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Unable to generate code.");

      setAccessCode(json.accessCode);

      try {
        await navigator.clipboard.writeText(json.accessCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // ignore
      }
    } catch (e: any) {
      setError(e?.message ?? "Unable to generate code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontWeight: 900 }}>Team access code</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Players use this to join your team.
          </div>
        </div>

        {accessCode ? (
          <div className="card">
            <div className="label">Current code</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.08em", marginTop: 6 }}>{accessCode}</div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              {copied ? "Copied to clipboard." : "Tip: click Generate new code to rotate it."}
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>
            For security, we don’t store a readable version of the code. Generate one below.
          </div>
        )}

        {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}

        <div className="row" style={{ alignItems: "center" }}>
          <Button variant="primary" onClick={generate} disabled={loading}>
            {loading ? "Generating…" : accessCode ? "Generate new code" : "Generate code"}
          </Button>
          <div className="muted" style={{ fontSize: 12 }}>
            Rotating invalidates the previous code.
          </div>
        </div>
      </div>
    </Card>
  );
}
