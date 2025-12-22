"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function DeleteCommentButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function onDelete() {
    const ok = window.confirm("Delete this comment?");
    if (!ok) return;

    setLoading(true);
    try {
      await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={onDelete} disabled={loading}>
      {loading ? "Deleting…" : "Delete"}
    </Button>
  );
}
