"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

export default function InactiveClient() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function signOut() {
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
    <div className="container" style={{ maxWidth: 520, paddingTop: 56 }}>
      <Card>
        <div className="stack">
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Access paused</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Your coach has temporarily deactivated your access to this team.
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 800 }}>What to do</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              If this was a mistake, ask your coach to reactivate you in <b>Team settings → Roster</b>.
            </div>
          </div>

          <Button variant="primary" onClick={signOut} disabled={loading}>
            {loading ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </Card>
    </div>
  );
}


