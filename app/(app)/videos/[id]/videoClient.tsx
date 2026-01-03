"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, SkipBack, SkipForward, Play, Pause } from "lucide-react";
import { Button, Card } from "@/components/ui";

function parseSeekSecondsFromHash() {
  const hash = window.location.hash || "";
  const m = hash.match(/#t=(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export default function VideoClient({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<"storage" | "external">("storage");
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [speed, setSpeed] = React.useState<number>(1);
  const [isPlaying, setIsPlaying] = React.useState(false);
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
      setFailed(false);
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
        console.error("load video failed", e);
        if (!cancelled) setFailed(true);
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

  if (failed) {
    return (
      <Card>
        <div className="muted">Video unavailable.</div>
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

  function downloadVideo() {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function setPlaybackSpeed(s: number) {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
  }

  function stepFrame(dir: "back" | "forward") {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setIsPlaying(false);
    // Approximate 30fps = ~0.033s per frame
    const delta = dir === "forward" ? 1 / 30 : -1 / 30;
    v.currentTime = Math.max(0, v.currentTime + delta);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }

  function handleVideoPlay() {
    setIsPlaying(true);
  }

  function handleVideoPause() {
    setIsPlaying(false);
  }

  // Keyboard shortcuts for video playback
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore if typing in input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const v = videoRef.current;
      if (!v) return;

      switch (e.key) {
        case " ": // Space - toggle play/pause
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft": // Left arrow - frame back or 5s back
          e.preventDefault();
          if (e.shiftKey) {
            v.currentTime = Math.max(0, v.currentTime - 5);
          } else {
            stepFrame("back");
          }
          break;
        case "ArrowRight": // Right arrow - frame forward or 5s forward
          e.preventDefault();
          if (e.shiftKey) {
            v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
          } else {
            stepFrame("forward");
          }
          break;
        case "ArrowUp": // Up arrow - speed up
          e.preventDefault();
          {
            const idx = SPEEDS.indexOf(speed as any);
            if (idx < SPEEDS.length - 1) setPlaybackSpeed(SPEEDS[idx + 1]);
          }
          break;
        case "ArrowDown": // Down arrow - slow down
          e.preventDefault();
          {
            const idx = SPEEDS.indexOf(speed as any);
            if (idx > 0) setPlaybackSpeed(SPEEDS[idx - 1]);
          }
          break;
        case "m": // M - mute toggle
          v.muted = !v.muted;
          break;
        case "f": // F - fullscreen toggle
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            v.requestFullscreen().catch(() => {});
          }
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [speed]);

  return (
    <Card>
      <video
        ref={videoRef}
        src={url ?? undefined}
        controls
        playsInline
        style={{ width: "100%", borderRadius: 12 }}
        onPlay={handleVideoPlay}
        onPause={handleVideoPause}
      />

      {/* Playback Controls */}
      <div className="bvVideoControls">
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          <button
            className="bvControlBtn"
            onClick={() => stepFrame("back")}
            title="Previous frame"
            aria-label="Previous frame"
          >
            <SkipBack size={16} />
          </button>
          <button
            className="bvControlBtn bvControlBtnLarge"
            onClick={togglePlay}
            title={isPlaying ? "Pause" : "Play"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            className="bvControlBtn"
            onClick={() => stepFrame("forward")}
            title="Next frame"
            aria-label="Next frame"
          >
            <SkipForward size={16} />
          </button>
        </div>

        <div className="bvSpeedPicker">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={speed === s ? "bvSpeedBtn bvSpeedBtnActive" : "bvSpeedBtn"}
              onClick={() => setPlaybackSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>

        <Button onClick={downloadVideo}>
          <Download size={16} />
          Download
        </Button>
      </div>
    </Card>
  );
}
