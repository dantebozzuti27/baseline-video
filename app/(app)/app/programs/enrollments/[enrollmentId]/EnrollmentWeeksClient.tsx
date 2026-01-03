"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Modal } from "@/components/ui";
import { toast } from "../../../../toast";

function linesToList(s: string) {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function listToLines(arr: any[]) {
  return (Array.isArray(arr) ? arr : []).map((x) => String(x ?? "").trim()).filter(Boolean).join("\n");
}

export default function EnrollmentWeeksClient({
  enrollment,
  player,
  template,
  weeks,
  overrides
}: {
  enrollment: { id: string; template_id: string; player_user_id: string; status: string };
  player: { display_name: string };
  template: { id: string; title: string; weeks_count: number };
  weeks: Array<{ week_index: number; goals: string[]; assignments: string[] }>;
  overrides: Array<{ week_index: number; goals: string[]; assignments: string[] }>;
}) {
  const router = useRouter();
  const [openWeek, setOpenWeek] = React.useState<number | null>(null);
  const [goals, setGoals] = React.useState("");
  const [assignments, setAssignments] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const baseByWeek = React.useMemo(() => {
    const m = new Map<number, { goals: string[]; assignments: string[] }>();
    for (const w of weeks) m.set(w.week_index, { goals: w.goals, assignments: w.assignments });
    return m;
  }, [weeks]);

  const overrideByWeek = React.useMemo(() => {
    const m = new Map<number, { goals: string[]; assignments: string[] }>();
    for (const w of overrides) m.set(w.week_index, { goals: w.goals, assignments: w.assignments });
    return m;
  }, [overrides]);

  function openEditor(weekIndex: number) {
    const ov = overrideByWeek.get(weekIndex);
    const base = baseByWeek.get(weekIndex);
    const g = ov?.goals ?? base?.goals ?? [];
    const a = ov?.assignments ?? base?.assignments ?? [];
    setGoals(listToLines(g));
    setAssignments(listToLines(a));
    setOpenWeek(weekIndex);
  }

  async function save() {
    if (!openWeek) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/enrollments/${enrollment.id}/overrides/${openWeek}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: linesToList(goals), assignments: linesToList(assignments) })
      });
      if (resp.ok) {
        toast("Week updated.");
        setOpenWeek(null);
        router.refresh();
      }
    } catch (e) {
      console.error("save week override failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 860 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{player.display_name}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            {template.title} • {String(enrollment.status).toUpperCase()}
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs/enrollments">
            Back
          </Link>
          <Link className="btn" href="/app/programs/feed">
            Feed
          </Link>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {Array.from({ length: template.weeks_count }).map((_, i) => {
          const weekIndex = i + 1;
          const ov = overrideByWeek.get(weekIndex);
          const base = baseByWeek.get(weekIndex);
          const goalsCount = (ov?.goals ?? base?.goals ?? []).length;
          const asgCount = (ov?.assignments ?? base?.assignments ?? []).length;
          return (
            <Card key={weekIndex}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>
                    Week {weekIndex} {ov ? <span className="pill">Customized</span> : null}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                    {goalsCount} goals • {asgCount} assignments
                  </div>
                </div>
                <Button variant={ov ? "default" : "primary"} onClick={() => openEditor(weekIndex)}>
                  Edit
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={openWeek !== null}
        title={openWeek ? `Edit Week ${openWeek}` : "Edit week"}
        onClose={() => (loading ? null : setOpenWeek(null))}
        footer={
          <>
            <Button onClick={() => setOpenWeek(null)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="stack">
          <div>
            <div className="label">Goals (one per line)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 120 }} value={goals} onChange={(e) => setGoals(e.target.value)} />
          </div>
          <div>
            <div className="label">Assignments (one per line)</div>
            <textarea
              className="input"
              style={{ marginTop: 8, minHeight: 140 }}
              value={assignments}
              onChange={(e) => setAssignments(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}


