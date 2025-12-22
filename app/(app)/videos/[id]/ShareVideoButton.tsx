"use client";

import * as React from "react";
import { Button } from "@/components/ui";

function videoUrl(videoId: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/app/videos/${videoId}`;
}

export default function ShareVideoButton({ videoId }: { videoId: string }) {
  const [status, setStatus] = React.useState<string | null>(null);

  async function onShare() {
    const url = videoUrl(videoId);
    setStatus(null);

    // Prefer native share sheet on iOS.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title: "Baseline Video", url });
        return;
      } catch {
        // fall through to copy
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("Copied link.");
      setTimeout(() => setStatus(null), 1800);
    } catch {
      setStatus("Copy failed. Tap and hold the URL in your address bar to copy.");
      setTimeout(() => setStatus(null), 2500);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <Button onClick={onShare}>Share</Button>
      {status ? <div className="muted" style={{ fontSize: 12 }}>{status}</div> : null}
    </div>
  );
}


