"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toast } from "../toast";

export default function RestoreVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function onRestore() {
    setLoading(true);
    try {
      const resp = await fetch(`/api/videos/${videoId}/restore`, { method: "POST" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? `Unable to restore (${resp.status}).`);
      toast("Restored.");
      router.refresh();
    } catch (e: any) {
      console.error("restore failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <Button variant="primary" onClick={onRestore} disabled={loading}>
        {loading ? "Restoring…" : "Restore"}
      </Button>
    </div>
  );
}


