"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function DeleteVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm("Move this video to Trash? You can restore it from Trash.");
    if (!ok) return;

    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? `Unable to move video to Trash (${resp.status}).`);

      router.replace("/app/trash");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Unable to move video to Trash.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <Button variant="danger" onClick={onDelete} disabled={loading}>
        {loading ? "Moving…" : "Move to Trash"}
      </Button>
      {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
    </div>
  );
}
