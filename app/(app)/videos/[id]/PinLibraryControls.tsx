"use client";

import * as React from "react";
import { Button } from "@/components/ui";

export default function PinLibraryControls({
  videoId,
  initialPinned,
  initialIsLibrary
}: {
  videoId: string;
  initialPinned: boolean;
  initialIsLibrary: boolean;
}) {
  const [pinned, setPinned] = React.useState(initialPinned);
  const [isLibrary, setIsLibrary] = React.useState(initialIsLibrary);
  const [loading, setLoading] = React.useState(false);

  async function update(next: { pinned?: boolean; isLibrary?: boolean }) {
    setLoading(true);
    try {
      const resp = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to update");
      if (typeof next.pinned === "boolean") setPinned(next.pinned);
      if (typeof next.isLibrary === "boolean") setIsLibrary(next.isLibrary);
    } catch (e: any) {
      console.error("pin/library update failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="row" style={{ alignItems: "center" }}>
      <Button
        variant={pinned ? "danger" : "default"}
        disabled={loading}
        onClick={() => update({ pinned: !pinned })}
      >
        {pinned ? "Unpin" : "Pin"}
      </Button>
      <Button disabled={loading} onClick={() => update({ isLibrary: !isLibrary })}>
        {isLibrary ? "Remove from library" : "Add to library"}
      </Button>
    </div>
  );
}
