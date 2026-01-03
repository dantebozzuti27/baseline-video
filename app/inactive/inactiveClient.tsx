"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Pill } from "@/components/ui";
import { PauseCircle } from "lucide-react";

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
    <div className="container" style={{ maxWidth: 440, paddingTop: 56 }}>
      <Card className="bvAuthCard">
        <div className="stack" style={{ gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div className="bvEmptyIcon" style={{ margin: "0 auto 16px" }}>
              <PauseCircle size={48} strokeWidth={1.5} />
            </div>
            <Pill variant="warning">PAUSED</Pill>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 12 }}>
              Access paused
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              Your coach has temporarily deactivated your access
            </div>
          </div>

          <div className="card" style={{ background: "var(--surface)" }}>
            <div style={{ fontWeight: 800 }}>What to do</div>
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
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


