"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@/components/ui";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function onClick() {
    setOpen(true);
  }

  async function doSignOut() {
    setLoading(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      setLoading(false);
      router.replace("/sign-in");
      router.refresh();
    }
  }

  return (
    <>
      <Button onClick={onClick} disabled={loading}>
        {loading ? "Signing out…" : "Sign out"}
      </Button>
      <Modal
        open={open}
        title="Sign out"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doSignOut} disabled={loading}>
              {loading ? "Signing out…" : "Sign out"}
            </Button>
          </>
        }
      >
        <div className="muted">You’ll need to sign in again to continue.</div>
      </Modal>
    </>
  );
}
