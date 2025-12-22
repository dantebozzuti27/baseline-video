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
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/videos/${videoId}/signed-url`, { cache: "no-store" });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json?.error ?? "Unable to load video.");
        if (!cancelled) setUrl(json.url);
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

  return (
    <Card>
      <video ref={videoRef} src={url ?? undefined} controls playsInline style={{ width: "100%", borderRadius: 12 }} />
    </Card>
  );
}
