"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Modal } from "@/components/ui";
import { toast } from "../../../../toast";

type TemplateDay = {
  id: string;
  week_index: number;
  day_index: number;
  focus_id: string | null;
  day_note: string | null;
};

type TemplateDayAssignment = {
  id: string;
  template_day_id: string;
  drill_id: string | null;
  sets: number | null;
  reps: number | null;
  minutes: number | null;
  requires_upload: boolean;
  upload_prompt: string | null;
  notes: string | null;
};

type DayOverride = {
  id: string;
  week_index: number;
  day_index: number;
  focus_id: string | null;
  day_note: string | null;
  assignments: any[];
};

type Focus = { id: string; name: string };
type Drill = { id: string; name: string };

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
  overrides,
  templateDays,
  templateDayAssignments,
  dayOverrides,
  focuses,
  drills
}: {
  enrollment: { id: string; template_id: string; player_user_id: string; status: string };
  player: { display_name: string };
  template: { id: string; title: string; weeks_count: number; cycle_days: number };
  weeks: Array<{ week_index: number; goals: string[]; assignments: string[] }>;
  overrides: Array<{ week_index: number; goals: string[]; assignments: string[] }>;
  templateDays: TemplateDay[];
  templateDayAssignments: TemplateDayAssignment[];
  dayOverrides: DayOverride[];
  focuses: Focus[];
  drills: Drill[];
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  // Week-level edit (legacy)
  const [openWeek, setOpenWeek] = React.useState<number | null>(null);
  const [goals, setGoals] = React.useState("");
  const [assignments, setAssignments] = React.useState("");

  // Day-level edit
  const [dayDialog, setDayDialog] = React.useState<{ week: number; day: number } | null>(null);
  const [dayFocusId, setDayFocusId] = React.useState<string>("");
  const [dayNote, setDayNote] = React.useState("");
  const [dayAssignments, setDayAssignments] = React.useState<any[]>([]);

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

  // Index template days by week/day
  const templateDayMap = React.useMemo(() => {
    const m = new Map<string, TemplateDay>();
    for (const d of templateDays) m.set(`${d.week_index}-${d.day_index}`, d);
    return m;
  }, [templateDays]);

  // Index template day assignments by template_day_id
  const assignmentsByDayId = React.useMemo(() => {
    const m = new Map<string, TemplateDayAssignment[]>();
    for (const a of templateDayAssignments) {
      if (!m.has(a.template_day_id)) m.set(a.template_day_id, []);
      m.get(a.template_day_id)!.push(a);
    }
    return m;
  }, [templateDayAssignments]);

  // Index day overrides by week/day
  const dayOverrideMap = React.useMemo(() => {
    const m = new Map<string, DayOverride>();
    for (const d of dayOverrides) m.set(`${d.week_index}-${d.day_index}`, d);
    return m;
  }, [dayOverrides]);

  const focusById = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of focuses) m[f.id] = f.name;
    return m;
  }, [focuses]);

  const drillById = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of drills) m[d.id] = d.name;
    return m;
  }, [drills]);

  // Week-level editor (legacy)
  function openWeekEditor(weekIndex: number) {
    const ov = overrideByWeek.get(weekIndex);
    const base = baseByWeek.get(weekIndex);
    const g = ov?.goals ?? base?.goals ?? [];
    const a = ov?.assignments ?? base?.assignments ?? [];
    setGoals(listToLines(g));
    setAssignments(listToLines(a));
    setOpenWeek(weekIndex);
  }

  async function saveWeek() {
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

  // Day-level editor
  function openDayEditor(weekIndex: number, dayIndex: number) {
    const key = `${weekIndex}-${dayIndex}`;
    const ov = dayOverrideMap.get(key);
    const base = templateDayMap.get(key);
    const baseDayId = base?.id ?? "";
    const baseAssignments = baseDayId ? assignmentsByDayId.get(baseDayId) ?? [] : [];

    // Use override values if present, otherwise fall back to template
    setDayFocusId(ov?.focus_id ?? base?.focus_id ?? "");
    setDayNote(ov?.day_note ?? base?.day_note ?? "");
    setDayAssignments(
      ov && ov.assignments.length > 0
        ? ov.assignments
        : baseAssignments.map((a) => ({
            drill_id: a.drill_id ?? "",
            sets: a.sets,
            reps: a.reps,
            minutes: a.minutes,
            requires_upload: a.requires_upload,
            upload_prompt: a.upload_prompt ?? "",
            notes: a.notes ?? ""
          }))
    );
    setDayDialog({ week: weekIndex, day: dayIndex });
  }

  async function saveDay() {
    if (!dayDialog) return;
    setLoading(true);
    try {
      const resp = await fetch(
        `/api/programs/enrollments/${enrollment.id}/days/${dayDialog.week}/${dayDialog.day}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            focusId: dayFocusId || null,
            dayNote: dayNote || null,
            assignments: dayAssignments
          })
        }
      );
      if (resp.ok) {
        toast("Day updated.");
        setDayDialog(null);
        router.refresh();
      }
    } catch (e) {
      console.error("save day override failed", e);
    } finally {
      setLoading(false);
    }
  }

  function addAssignment() {
    setDayAssignments((a) => [
      ...a,
      { drill_id: "", sets: null, reps: null, minutes: null, requires_upload: false, upload_prompt: "", notes: "" }
    ]);
  }

  function removeAssignment(idx: number) {
    setDayAssignments((a) => a.filter((_, i) => i !== idx));
  }

  function updateAssignment(idx: number, field: string, value: any) {
    setDayAssignments((a) => a.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 900 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{player.display_name}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            {template.title} • {String(enrollment.status).toUpperCase()} • {template.cycle_days} day cycle
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
        {Array.from({ length: template.weeks_count }).map((_, wi) => {
          const weekIndex = wi + 1;
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
                    {goalsCount} goals • {asgCount} assignments (legacy)
                  </div>
                </div>
                <Button variant={ov ? "default" : "primary"} onClick={() => openWeekEditor(weekIndex)}>
                  Edit week
                </Button>
              </div>

              {/* Day-level rows */}
              <div className="stack" style={{ marginTop: 12, gap: 8 }}>
                {Array.from({ length: template.cycle_days }).map((_, di) => {
                  const dayIndex = di + 1;
                  const key = `${weekIndex}-${dayIndex}`;
                  const dayOv = dayOverrideMap.get(key);
                  const baseDay = templateDayMap.get(key);
                  const focusId = dayOv?.focus_id ?? baseDay?.focus_id;
                  const focusName = focusId ? focusById[focusId] ?? "Focus" : null;
                  const baseDayId = baseDay?.id ?? "";
                  const baseAsgCount = baseDayId ? (assignmentsByDayId.get(baseDayId) ?? []).length : 0;
                  const ovAsgCount = dayOv ? dayOv.assignments.length : 0;
                  const asgCountDisplay = dayOv && ovAsgCount > 0 ? ovAsgCount : baseAsgCount;

                  return (
                    <div
                      key={dayIndex}
                      className="row"
                      style={{
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        background: "var(--surface)",
                        borderRadius: 6
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700 }}>Day {dayIndex}</span>
                        {focusName ? (
                          <span className="muted" style={{ marginLeft: 8 }}>
                            {focusName}
                          </span>
                        ) : null}
                        <span className="muted" style={{ marginLeft: 8 }}>
                          • {asgCountDisplay} assignments
                        </span>
                        {dayOv ? <span className="pill" style={{ marginLeft: 8 }}>Customized</span> : null}
                      </div>
                      <Button onClick={() => openDayEditor(weekIndex, dayIndex)}>Edit</Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Week-level modal (legacy) */}
      <Modal
        open={openWeek !== null}
        title={openWeek ? `Edit Week ${openWeek}` : "Edit week"}
        onClose={() => (loading ? null : setOpenWeek(null))}
        footer={
          <>
            <Button onClick={() => setOpenWeek(null)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveWeek} disabled={loading}>
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

      {/* Day-level modal */}
      <Modal
        open={dayDialog !== null}
        title={dayDialog ? `Edit Week ${dayDialog.week} Day ${dayDialog.day}` : "Edit day"}
        onClose={() => (loading ? null : setDayDialog(null))}
        footer={
          <>
            <Button onClick={() => setDayDialog(null)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveDay} disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="stack" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <div>
            <div className="label">Focus</div>
            <select
              className="input"
              style={{ marginTop: 8 }}
              value={dayFocusId}
              onChange={(e) => setDayFocusId(e.target.value)}
            >
              <option value="">— None —</option>
              {focuses.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="label">Day note</div>
            <textarea
              className="input"
              style={{ marginTop: 8, minHeight: 80 }}
              value={dayNote}
              onChange={(e) => setDayNote(e.target.value)}
              placeholder="Optional note for this day"
            />
          </div>

          <div style={{ fontWeight: 900, marginTop: 12 }}>Assignments</div>
          {dayAssignments.map((a, idx) => (
            <div key={idx} style={{ padding: 12, background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div className="stack" style={{ gap: 8 }}>
                <div>
                  <div className="label">Drill</div>
                  <select
                    className="input"
                    style={{ marginTop: 4 }}
                    value={a.drill_id ?? ""}
                    onChange={(e) => updateAssignment(idx, "drill_id", e.target.value || null)}
                  >
                    <option value="">— None —</option>
                    {drills.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="label">Sets</div>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={a.sets ?? ""}
                      onChange={(e) => updateAssignment(idx, "sets", e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="label">Reps</div>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={a.reps ?? ""}
                      onChange={(e) => updateAssignment(idx, "reps", e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="label">Minutes</div>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={a.minutes ?? ""}
                      onChange={(e) => updateAssignment(idx, "minutes", e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                </div>
                <div>
                  <label className="row" style={{ gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={a.requires_upload ?? false}
                      onChange={(e) => updateAssignment(idx, "requires_upload", e.target.checked)}
                    />
                    <span>Requires upload</span>
                  </label>
                </div>
                {a.requires_upload ? (
                  <div>
                    <div className="label">Upload prompt</div>
                    <input
                      className="input"
                      style={{ marginTop: 4 }}
                      value={a.upload_prompt ?? ""}
                      onChange={(e) => updateAssignment(idx, "upload_prompt", e.target.value)}
                      placeholder="e.g. Record your swing from behind"
                    />
                  </div>
                ) : null}
                <div>
                  <div className="label">Notes</div>
                  <textarea
                    className="input"
                    style={{ marginTop: 4, minHeight: 60 }}
                    value={a.notes ?? ""}
                    onChange={(e) => updateAssignment(idx, "notes", e.target.value)}
                    placeholder="Optional notes for player"
                  />
                </div>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <Button onClick={() => removeAssignment(idx)}>Remove</Button>
                </div>
              </div>
            </div>
          ))}
          <div>
            <Button onClick={addAssignment}>+ Add assignment</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
