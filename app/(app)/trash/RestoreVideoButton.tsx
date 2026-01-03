"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toast } from "../toast";

export default function RestoreVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onRestore() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/videos/${videoId}/restore`, { method: "POST" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? `Unable to restore (${resp.status}).`);
      toast("Restored.");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Unable to restore.");
      toast("Unable to restore.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <Button variant="primary" onClick={onRestore} disabled={loading}>
        {loading ? "Restoring…" : "Restore"}
      </Button>
      {error ? <div style={{ color: "var(--danger)", fontSize: 12 }}>{error}</div> : null}
    </div>
  );
}


