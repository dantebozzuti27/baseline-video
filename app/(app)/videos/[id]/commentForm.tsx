"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toast } from "../../toast";

function getCurrentVideoTimeSeconds(): number | null {
  const el = document.querySelector("video");
  if (!el) return null;
  const t = (el as HTMLVideoElement).currentTime;
  if (!Number.isFinite(t) || t < 0) return null;
  return Math.floor(t);
}

export default function CommentForm({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [timestampSeconds, setTimestampSeconds] = React.useState<string>("");
  const [visibility, setVisibility] = React.useState<"team" | "player_private" | "coach_only">("team");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [role, setRole] = React.useState<"coach" | "player" | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
        if (!cancelled) setRole((data?.role as any) ?? null);
      } catch {
        // ignore
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

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
        body: JSON.stringify({ body: body.trim(), timestampSeconds: ts, visibility })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? `Unable to post comment (${resp.status}).`);

      setBody("");
      setTimestampSeconds("");
      setVisibility("team");
      setSuccess("Posted.");
      toast("Comment posted.");
      setTimeout(() => setSuccess(null), 2000);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Unable to post comment.");
      toast("Unable to post comment.");
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
            <div style={{ marginTop: 8 }}>
              <Button
                onClick={() => {
                  const sec = getCurrentVideoTimeSeconds();
                  if (sec !== null) setTimestampSeconds(String(sec));
                }}
              >
                Use current time
              </Button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>

        {role ? (
          <div className="row" style={{ alignItems: "center" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Visibility:
            </div>
            <label className="pill" style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === "team"}
                onChange={() => setVisibility("team")}
                style={{ marginRight: 8 }}
              />
              Team
            </label>
            {role === "player" ? (
              <label className="pill" style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === "player_private"}
                  onChange={() => setVisibility("player_private")}
                  style={{ marginRight: 8 }}
                />
                Private note (only you)
              </label>
            ) : (
              <label className="pill" style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === "coach_only"}
                  onChange={() => setVisibility("coach_only")}
                  style={{ marginRight: 8 }}
                />
                Coach note (coach-only)
              </label>
            )}
          </div>
        ) : null}

        {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
        {success ? <div style={{ color: "var(--primary)", fontSize: 13 }}>{success}</div> : null}
      </form>
    </Card>
  );
}
