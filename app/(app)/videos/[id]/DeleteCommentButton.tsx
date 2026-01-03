"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@/components/ui";

export default function DeleteCommentButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function onDelete() {
    setOpen(true);
  }

  async function doDelete() {
    setLoading(true);
    try {
      await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={onDelete} disabled={loading}>
        {loading ? "Deleting…" : "Delete"}
      </Button>
      <Modal
        open={open}
        title="Delete comment"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete} disabled={loading}>
              {loading ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <div className="muted">This can’t be undone.</div>
      </Modal>
    </>
  );
}
