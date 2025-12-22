"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function DeleteVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm("Delete this video? This cannot be undone.");
    if (!ok) return;

    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? `Unable to delete video (${resp.status}).`);

      router.replace("/app");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Unable to delete video.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <Button variant="danger" onClick={onDelete} disabled={loading}>
        {loading ? "Deleting…" : "Delete video"}
      </Button>
      {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
    </div>
  );
}
