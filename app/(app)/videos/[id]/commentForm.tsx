"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

export default function CommentForm({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [timestampSeconds, setTimestampSeconds] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!body.trim()) {
      setError("Write a comment.");
      return;
    }

    const ts = timestampSeconds.trim() ? Number(timestampSeconds.trim()) : null;
    if (ts !== null && (!Number.isFinite(ts) || ts < 0)) {
      setError("Timestamp must be a positive number of seconds.");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`/api/videos/${videoId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), timestampSeconds: ts })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? `Unable to post comment (${resp.status}).`);

      setBody("");
      setTimestampSeconds("");
      setSuccess("Posted.");
      setTimeout(() => setSuccess(null), 2000);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Unable to post comment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form className="stack" onSubmit={onSubmit}>
        <div className="stack" style={{ gap: 6 }}>
          <div className="label">Comment</div>
          <textarea
            className="textarea"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Quick cue, what to watch for…"
          />
        </div>
        <div className="row">
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="label">Timestamp seconds (optional)</div>
            <input
              className="input"
              inputMode="numeric"
              value={timestampSeconds}
              onChange={(e) => setTimestampSeconds(e.target.value)}
              placeholder="e.g. 12"
            />
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>

        {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
        {success ? <div style={{ color: "var(--primary)", fontSize: 13 }}>{success}</div> : null}
      </form>
    </Card>
  );
}
