"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@/components/ui";
import { toast } from "../toast";

export default function PurgeVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function onPurge() {
    setOpen(true);
  }

  async function doPurge() {
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
      <>
        <Button variant="danger" onClick={onPurge} disabled={loading}>
          {loading ? "Deleting…" : "Delete permanently"}
        </Button>
        <Modal
          open={open}
          title="Delete permanently"
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={doPurge} disabled={loading}>
                {loading ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        >
          <div className="muted">This can’t be undone.</div>
        </Modal>
      </>
    </div>
  );
}


