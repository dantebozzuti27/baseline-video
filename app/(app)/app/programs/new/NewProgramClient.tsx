"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { toast } from "../../../toast";

export default function NewProgramClient() {
  const router = useRouter();
  const [title, setTitle] = React.useState("Remote Program");
  const [weeksCount, setWeeksCount] = React.useState(8);
  const [cycleDays, setCycleDays] = React.useState(7);
  const [loading, setLoading] = React.useState(false);

  async function create() {
    setLoading(true);
    try {
      const resp = await fetch("/api/programs/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, weeksCount, cycleDays })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to create program.");
      const id = (json as any)?.id as string | undefined;
      toast("Program created.");
      router.replace(id ? `/app/programs/${id}` : "/app/programs");
      router.refresh();
    } catch (e: any) {
      console.error("create program failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 720 }}>
      <Card>
        <div className="stack">
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>New program</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              Build a shared week-by-week template you can enroll multiple players into.
            </div>
          </div>

          <Input label="Program name" name="title" value={title} onChange={setTitle} placeholder="Remote Hitting Program" />

          <div>
            <div className="label">Length</div>
            <div className="row" style={{ marginTop: 8 }}>
              {[4, 8, 12].map((n) => (
                <Button key={n} variant={weeksCount === n ? "primary" : "default"} onClick={() => setWeeksCount(n)} disabled={loading}>
                  {n} weeks
                </Button>
              ))}
              <div style={{ flex: 1, minWidth: 180 }}>
                <Input
                  label="Custom weeks"
                  name="weeksCount"
                  type="number"
                  value={String(weeksCount)}
                  onChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    setWeeksCount(Math.max(1, Math.min(52, Math.round(n))));
                  }}
                  placeholder="8"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="label">Cadence</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              How many days count as one “week” in this program.
            </div>
            <div className="row" style={{ marginTop: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <Input
                  label="Days per week"
                  name="cycleDays"
                  type="number"
                  value={String(cycleDays)}
                  onChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    setCycleDays(Math.max(1, Math.min(21, Math.round(n))));
                  }}
                  placeholder="7"
                />
              </div>
              <div className="row" style={{ gap: 8 }}>
                {[7, 10, 14].map((n) => (
                  <Button key={n} variant={cycleDays === n ? "primary" : "default"} onClick={() => setCycleDays(n)} disabled={loading}>
                    {n} days
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button variant="primary" onClick={create} disabled={loading}>
              {loading ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}


