"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toast } from "../../toast";

export default function DeleteVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function onDelete() {
    const ok = window.confirm("Move this video to Trash? You can restore it from Trash.");
    if (!ok) return;

    setLoading(true);
    try {
      const resp = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? `Unable to move video to Trash (${resp.status}).`);

      toast("Moved to Trash.");
      router.replace("/app/trash");
      router.refresh();
    } catch (e: any) {
      console.error("move to trash failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <Button variant="danger" onClick={onDelete} disabled={loading}>
        {loading ? "Moving…" : "Move to Trash"}
      </Button>
    </div>
  );
}
