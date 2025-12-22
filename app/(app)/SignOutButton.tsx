"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function onClick() {
    const ok = window.confirm("Sign out?");
    if (!ok) return;

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
    <Button onClick={onClick} disabled={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}
