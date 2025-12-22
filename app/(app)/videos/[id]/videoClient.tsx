"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

export default function VideoClient({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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
      <video src={url ?? undefined} controls playsInline style={{ width: "100%", borderRadius: 12 }} />
    </Card>
  );
}


