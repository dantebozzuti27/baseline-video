"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toast } from "../toast";

export default function PurgeVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function onPurge() {
    const ok = window.confirm("Delete permanently? This cannot be undone.");
    if (!ok) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/videos/${videoId}/purge`, { method: "POST" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? `Unable to delete permanently (${resp.status}).`);
      toast("Deleted permanently.");
      router.refresh();
    } catch (e: any) {
      console.error("purge failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <Button variant="danger" onClick={onPurge} disabled={loading}>
        {loading ? "Deleting…" : "Delete permanently"}
      </Button>
    </div>
  );
}


