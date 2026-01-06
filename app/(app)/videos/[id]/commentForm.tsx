"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toast } from "../../toast";
import { Eye, EyeOff } from "lucide-react";

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
  // Simplified visibility: either shared with player (team) or coach-only
  const [coachOnly, setCoachOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [role, setRole] = React.useState<"coach" | "player" | "parent" | null>(null);

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
    setSuccess(null);

    if (!body.trim()) {
      return;
    }

    const ts = timestampSeconds.trim() ? Number(timestampSeconds.trim()) : null;
    if (ts !== null && (!Number.isFinite(ts) || ts < 0)) {
      return;
    }

    // Map simplified toggle to visibility value
    // Coaches can choose coach_only, everyone else uses team (visible to player + coach)
    const visibility = role === "coach" && coachOnly ? "coach_only" : "team";

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
      setCoachOnly(false);
      setSuccess("Posted.");
      toast("Comment posted.");
      setTimeout(() => setSuccess(null), 2000);
      router.refresh();
    } catch (err: any) {
      console.error("post comment failed", err);
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

        <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div className="label">Timestamp (optional)</div>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                inputMode="numeric"
                value={timestampSeconds}
                onChange={(e) => setTimestampSeconds(e.target.value)}
                placeholder="sec"
                style={{ width: 70 }}
              />
              <Button
                type="button"
                onClick={() => {
                  const sec = getCurrentVideoTimeSeconds();
                  if (sec !== null) setTimestampSeconds(String(sec));
                }}
              >
                Now
              </Button>
            </div>
          </div>
          
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Posting…" : "Post"}
          </Button>
        </div>

        {/* Simplified visibility toggle - only shown for coaches */}
        {role === "coach" && (
          <button
            type="button"
            className={coachOnly ? "pill" : "btn"}
            onClick={() => setCoachOnly(!coachOnly)}
            style={{ 
              display: "inline-flex", 
              alignItems: "center", 
              gap: 6,
              alignSelf: "flex-start"
            }}
          >
            {coachOnly ? <EyeOff size={14} /> : <Eye size={14} />}
            {coachOnly ? "Coach note (only you)" : "Share with player"}
          </button>
        )}

        {success ? <div style={{ color: "var(--primary)", fontSize: 13 }}>{success}</div> : null}
      </form>
    </Card>
  );
}
