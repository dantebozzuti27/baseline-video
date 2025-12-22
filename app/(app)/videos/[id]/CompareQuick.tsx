"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function CompareQuick({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [left, setLeft] = React.useState<string | null>(null);
  const [right, setRight] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setLeft(window.localStorage.getItem("bv:compareLeft"));
      setRight(window.localStorage.getItem("bv:compareRight"));
    } catch {
      // ignore
    }
  }, []);

  function setSide(side: "left" | "right") {
    try {
      if (side === "left") {
        window.localStorage.setItem("bv:compareLeft", videoId);
        setLeft(videoId);
      } else {
        window.localStorage.setItem("bv:compareRight", videoId);
        setRight(videoId);
      }
    } catch {
      // ignore
    }
  }

  function openCompare() {
    const l = left ?? "";
    const r = right ?? "";
    router.push(`/app/compare?left=${encodeURIComponent(l)}&right=${encodeURIComponent(r)}`);
  }

  return (
    <div className="row" style={{ alignItems: "center" }}>
      <Button onClick={() => setSide("left")}>Set as Left</Button>
      <Button onClick={() => setSide("right")}>Set as Right</Button>
      <Button variant="primary" onClick={openCompare}>
        Compare
      </Button>
      <div className="muted" style={{ fontSize: 12 }}>
        Left: {left ? left.slice(0, 8) : "—"} • Right: {right ? right.slice(0, 8) : "—"}
      </div>
    </div>
  );
}
