"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toast } from "../toast";

export default function PurgeVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onPurge() {
    const ok = window.confirm("Delete permanently? This cannot be undone.");
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/videos/${videoId}/purge`, { method: "POST" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? `Unable to delete permanently (${resp.status}).`);
      toast("Deleted permanently.");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Unable to delete permanently.");
      toast("Unable to delete permanently.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <Button variant="danger" onClick={onPurge} disabled={loading}>
        {loading ? "Deleting…" : "Delete permanently"}
      </Button>
      {error ? <div style={{ color: "var(--danger)", fontSize: 12 }}>{error}</div> : null}
    </div>
  );
}


