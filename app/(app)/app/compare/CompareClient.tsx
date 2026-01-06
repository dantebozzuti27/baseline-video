"use client";

import * as React from "react";
import { Button, Card } from "@/components/ui";
import { Play, Pause, SkipBack, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

type Video = {
  id: string;
  title: string;
  owner_name: string;
  created_at: string;
  signed_url?: string;
};

type Props = {
  videos: Video[];
  initialLeft?: string;
  initialRight?: string;
};

export default function CompareClient({ videos, initialLeft, initialRight }: Props) {
  const [leftId, setLeftId] = React.useState(initialLeft || "");
  const [rightId, setRightId] = React.useState(initialRight || "");
  const [activePane, setActivePane] = React.useState<"left" | "right">("left");
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  const leftRef = React.useRef<HTMLVideoElement>(null);
  const rightRef = React.useRef<HTMLVideoElement>(null);

  const leftVideo = videos.find((v) => v.id === leftId);
  const rightVideo = videos.find((v) => v.id === rightId);

  // Detect mobile
  React.useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 800);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Sync play/pause
  function togglePlay() {
    if (isPlaying) {
      leftRef.current?.pause();
      rightRef.current?.pause();
    } else {
      leftRef.current?.play();
      rightRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  }

  // Restart both
  function restart() {
    if (leftRef.current) leftRef.current.currentTime = 0;
    if (rightRef.current) rightRef.current.currentTime = 0;
  }

  // Step frame
  function stepFrame(direction: number) {
    const step = direction * (1 / 30); // ~30fps
    if (leftRef.current) leftRef.current.currentTime += step;
    if (rightRef.current) rightRef.current.currentTime += step;
  }

  // Handle video ended
  function handleEnded() {
    setIsPlaying(false);
  }

  const videoOptions = videos.map((v) => ({
    value: v.id,
    label: `${v.title} • ${v.owner_name} • ${new Date(v.created_at).toLocaleDateString()}`
  }));

  const bothSelected = !!leftId && !!rightId;

  return (
    <div className="stack">
      {/* Video Selection */}
      <Card>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Select Videos</div>
        
        <div className="stack" style={{ gap: 12 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>
              <span className="pill" style={{ fontSize: 10, padding: "2px 6px" }}>LEFT</span>
            </div>
            <select
              className="select"
              value={leftId}
              onChange={(e) => setLeftId(e.target.value)}
            >
              <option value="">Select a video…</option>
              {videoOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 4 }}>
              <span className="pill pillWarning" style={{ fontSize: 10, padding: "2px 6px" }}>RIGHT</span>
            </div>
            <select
              className="select"
              value={rightId}
              onChange={(e) => setRightId(e.target.value)}
            >
              <option value="">Select a video…</option>
              {videoOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {bothSelected && (
        <>
          {/* Synchronized Controls */}
          <Card>
            <div className="row" style={{ justifyContent: "center", gap: 8 }}>
              <Button onClick={restart} aria-label="Restart">
                <RotateCcw size={18} />
              </Button>
              <Button onClick={() => stepFrame(-1)} aria-label="Step back">
                <SkipBack size={18} />
              </Button>
              <Button variant="primary" onClick={togglePlay}>
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </Button>
              <Button onClick={() => stepFrame(1)} aria-label="Step forward">
                <SkipBack size={18} style={{ transform: "scaleX(-1)" }} />
              </Button>
            </div>
            <div className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 8 }}>
              Controls sync both videos
            </div>
          </Card>

          {/* Mobile: Toggle between views */}
          {isMobile && (
            <div className="row" style={{ justifyContent: "center" }}>
              <button
                className={activePane === "left" ? "pill" : "btn"}
                onClick={() => setActivePane("left")}
              >
                <ChevronLeft size={14} />
                Left
              </button>
              <button
                className={activePane === "right" ? "pill pillWarning" : "btn"}
                onClick={() => setActivePane("right")}
              >
                Right
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Video Display */}
          {isMobile ? (
            // Mobile: Show one at a time
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div 
                className="row" 
                style={{ 
                  padding: "8px 12px", 
                  background: activePane === "left" ? "rgba(99, 179, 255, 0.1)" : "rgba(255, 179, 71, 0.1)"
                }}
              >
                <span className={activePane === "left" ? "pill" : "pill pillWarning"}>
                  {activePane === "left" ? "LEFT" : "RIGHT"}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {activePane === "left" ? leftVideo?.title : rightVideo?.title}
                </span>
              </div>
              
              <div style={{ display: activePane === "left" ? "block" : "none" }}>
                {leftVideo?.signed_url && (
                  <video
                    ref={leftRef}
                    src={leftVideo.signed_url}
                    onEnded={handleEnded}
                    playsInline
                    style={{ width: "100%", display: "block" }}
                  />
                )}
              </div>
              
              <div style={{ display: activePane === "right" ? "block" : "none" }}>
                {rightVideo?.signed_url && (
                  <video
                    ref={rightRef}
                    src={rightVideo.signed_url}
                    onEnded={handleEnded}
                    playsInline
                    style={{ width: "100%", display: "block" }}
                  />
                )}
              </div>
            </div>
          ) : (
            // Desktop: Side by side
            <div className="bvCompareGrid">
              <div className="bvComparePane">
                <div className="bvComparePaneHeader">
                  <span className="pill">LEFT</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{leftVideo?.title}</span>
                </div>
                {leftVideo?.signed_url && (
                  <video
                    ref={leftRef}
                    src={leftVideo.signed_url}
                    onEnded={handleEnded}
                    playsInline
                    style={{ width: "100%", borderRadius: 8 }}
                  />
                )}
              </div>
              
              <div className="bvComparePane">
                <div className="bvComparePaneHeader">
                  <span className="pill pillWarning">RIGHT</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{rightVideo?.title}</span>
                </div>
                {rightVideo?.signed_url && (
                  <video
                    ref={rightRef}
                    src={rightVideo.signed_url}
                    onEnded={handleEnded}
                    playsInline
                    style={{ width: "100%", borderRadius: 8 }}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {!bothSelected && (
        <div 
          className="card" 
          style={{ 
            textAlign: "center", 
            padding: "48px 24px",
            color: "var(--muted)"
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
            Select two videos to compare
          </div>
          <div style={{ fontSize: 14 }}>
            Compare swings, mechanics, or track progress over time
          </div>
        </div>
      )}
    </div>
  );
}

