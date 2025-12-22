"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

function parseSeekSecondsFromHash() {
  const hash = window.location.hash || "";
  const m = hash.match(/#t=(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export default function VideoClient({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<"storage" | "external">("storage");
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  function getYoutubeEmbed(u: string) {
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      let id: string | null = null;
      if (host === "youtu.be") id = parsed.pathname.replace("/", "") || null;
      if (host === "youtube.com" || host === "m.youtube.com") {
        if (parsed.pathname === "/watch") id = parsed.searchParams.get("v");
        if (parsed.pathname.startsWith("/shorts/")) id = parsed.pathname.split("/")[2] || null;
        if (parsed.pathname.startsWith("/embed/")) id = parsed.pathname.split("/")[2] || null;
      }
      if (!id) return null;
      if (!/^[a-zA-Z0-9_-]{6,}$/.test(id)) return null;
      return `https://www.youtube.com/embed/${id}`;
    } catch {
      return null;
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/videos/${videoId}/signed-url`, { cache: "no-store" });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json?.error ?? "Unable to load video.");
        const nextKind = (json as any)?.kind === "external" ? "external" : "storage";
        if (!cancelled) {
          setKind(nextKind);
          setUrl((json as any)?.url ?? null);
        }

        // Best-effort: mark video as seen for true unread.
        fetch(`/api/videos/${videoId}/touch`, { method: "POST" }).catch(() => {});
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unable to load video.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  React.useEffect(() => {
    function trySeek() {
      const sec = parseSeekSecondsFromHash();
      if (sec === null) return;
      const v = videoRef.current;
      if (!v) return;
      try {
        v.currentTime = sec;
        v.play().catch(() => {});
      } catch {
        // ignore
      }
    }

    window.addEventListener("hashchange", trySeek);
    // initial seek
    setTimeout(trySeek, 50);

    return () => {
      window.removeEventListener("hashchange", trySeek);
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <div className="muted">Loading video…</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ color: "var(--danger)" }}>{error}</div>
        <div style={{ marginTop: 12 }}>
          <Button
            onClick={() => {
              setUrl(null);
              router.refresh();
            }}
          >
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (kind === "external" && url) {
    const yt = getYoutubeEmbed(url);
    return (
      <Card>
        <div className="stack" style={{ gap: 10 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            This is a link video.
          </div>
          {yt ? (
            <iframe
              src={yt}
              style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 12, border: "1px solid var(--border)" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Video"
            />
          ) : (
            <a className="btn btnPrimary" href={url} target="_blank" rel="noreferrer">
              Open link
            </a>
          )}
          <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>
            {url}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <video ref={videoRef} src={url ?? undefined} controls playsInline style={{ width: "100%", borderRadius: 12 }} />
    </Card>
  );
}
