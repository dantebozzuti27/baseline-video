"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Modal, Select } from "@/components/ui";
import { toast } from "../../../toast";

function linesToList(s: string) {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function listToLines(arr: any[]) {
  return (Array.isArray(arr) ? arr : []).map((x) => String(x ?? "").trim()).filter(Boolean).join("\n");
}

export default function TemplateEditorClient({
  template,
  weeks,
  focuses,
  drills,
  days,
  dayAssignments
}: {
  template: { id: string; title: string; weeks_count: number; cycle_days: number };
  weeks: Array<{ week_index: number; goals: string[]; assignments: string[] }>;
  focuses: Array<{ id: string; name: string }>;
  drills: Array<{ id: string; title: string; category: string }>;
  days: Array<{ week_index: number; day_index: number; focus_id: string | null; note: string }>;
  dayAssignments: Array<{
    id: string;
    week_index: number;
    day_index: number;
    drill_id: string;
    sets: number | null;
    reps: number | null;
    duration_min: number | null;
    requires_upload: boolean;
    upload_prompt: string;
    notes_to_player: string;
    sort_order: number;
  }>;
}) {
  const router = useRouter();
  const [openWeek, setOpenWeek] = React.useState<number | null>(null);
  const [goals, setGoals] = React.useState("");
  const [assignments, setAssignments] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const [weekIdx, setWeekIdx] = React.useState(1);
  const [dayIdx, setDayIdx] = React.useState(1);

  const [dayFocusId, setDayFocusId] = React.useState<string>("");
  const [dayNote, setDayNote] = React.useState("");

  const [assignModal, setAssignModal] = React.useState<{ assignmentId?: string } | null>(null);
  const [assignDrillId, setAssignDrillId] = React.useState("");
  const [assignSets, setAssignSets] = React.useState("");
  const [assignReps, setAssignReps] = React.useState("");
  const [assignDuration, setAssignDuration] = React.useState("");
  const [assignRequiresUpload, setAssignRequiresUpload] = React.useState(false);
  const [assignUploadPrompt, setAssignUploadPrompt] = React.useState("");
  const [assignNotes, setAssignNotes] = React.useState("");

  const weekMap = React.useMemo(() => {
    const m = new Map<number, { goals: string[]; assignments: string[] }>();
    for (const w of weeks) m.set(w.week_index, { goals: w.goals, assignments: w.assignments });
    return m;
  }, [weeks]);

  const focusByKey = React.useMemo(() => {
    const m: Record<string, { focus_id: string | null; note: string }> = {};
    for (const d of days) m[`${d.week_index}:${d.day_index}`] = { focus_id: d.focus_id, note: d.note ?? "" };
    return m;
  }, [days]);

  const drillById = React.useMemo(() => {
    const m: Record<string, { title: string; category: string }> = {};
    for (const d of drills) m[d.id] = { title: d.title, category: d.category };
    return m;
  }, [drills]);

  const assignmentsForDay = React.useMemo(() => {
    return (dayAssignments ?? [])
      .filter((a) => a.week_index === weekIdx && a.day_index === dayIdx)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [dayAssignments, weekIdx, dayIdx]);

  React.useEffect(() => {
    const v = focusByKey[`${weekIdx}:${dayIdx}`];
    setDayFocusId(v?.focus_id ?? "");
    setDayNote(v?.note ?? "");
  }, [weekIdx, dayIdx, focusByKey]);

  function openEditor(weekIndex: number) {
    const w = weekMap.get(weekIndex);
    setGoals(listToLines(w?.goals ?? []));
    setAssignments(listToLines(w?.assignments ?? []));
    setOpenWeek(weekIndex);
  }

  async function saveDay() {
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/templates/${template.id}/days/${weekIdx}/${dayIdx}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusId: dayFocusId || null, note: dayNote })
      });
      if (resp.ok) {
        toast("Day updated.");
        router.refresh();
      }
    } catch (e) {
      console.error("save day failed", e);
    } finally {
      setLoading(false);
    }
  }

  function openAssignmentEditor(existing?: (typeof dayAssignments)[number]) {
    setAssignModal(existing ? { assignmentId: existing.id } : {});
    setAssignDrillId(existing?.drill_id ?? drills?.[0]?.id ?? "");
    setAssignSets(existing?.sets ? String(existing.sets) : "");
    setAssignReps(existing?.reps ? String(existing.reps) : "");
    setAssignDuration(existing?.duration_min ? String(existing.duration_min) : "");
    setAssignRequiresUpload(Boolean(existing?.requires_upload));
    setAssignUploadPrompt(existing?.upload_prompt ?? "");
    setAssignNotes(existing?.notes_to_player ?? "");
  }

  async function saveAssignment() {
    if (!assignDrillId) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/templates/${template.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: assignModal?.assignmentId,
          weekIndex: weekIdx,
          dayIndex: dayIdx,
          drillId: assignDrillId,
          sets: assignSets ? Number(assignSets) : null,
          reps: assignReps ? Number(assignReps) : null,
          durationMin: assignDuration ? Number(assignDuration) : null,
          requiresUpload: assignRequiresUpload,
          uploadPrompt: assignUploadPrompt.trim() || null,
          notesToPlayer: assignNotes.trim() || null,
          sortOrder: assignmentsForDay.length
        })
      });
      if (resp.ok) {
        toast("Assignment saved.");
        setAssignModal(null);
        router.refresh();
      }
    } catch (e) {
      console.error("save assignment failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAssignment(assignmentId: string) {
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/templates/${template.id}/assignments/${assignmentId}`, { method: "DELETE" });
      if (resp.ok) {
        toast("Assignment removed.");
        router.refresh();
      }
    } catch (e) {
      console.error("delete assignment failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!openWeek) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/templates/${template.id}/weeks/${openWeek}`, {
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
      console.error("save template week failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 860 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{template.title}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Shared template • {template.weeks_count} weeks
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs">
            Back
          </Link>
          <Link className="btn" href="/app/programs/library">
            Library
          </Link>
          <Link className="btn" href="/app/programs/enrollments">
            Enroll players
          </Link>
          <Link className="btn btnPrimary" href="/app/programs/feed">
            Feed
          </Link>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Builder</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Week → Day → Focus + drills. Players see “Today” with this exact structure.
            </div>

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {Array.from({ length: template.weeks_count }).map((_, i) => {
                const w = i + 1;
                return (
                  <Button key={w} variant={weekIdx === w ? "primary" : "default"} onClick={() => setWeekIdx(w)} disabled={loading}>
                    Week {w}
                  </Button>
                );
              })}
            </div>

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {Array.from({ length: template.cycle_days }).map((_, i) => {
                const d = i + 1;
                return (
                  <Button key={d} variant={dayIdx === d ? "primary" : "default"} onClick={() => setDayIdx(d)} disabled={loading}>
                    Day {d}
                  </Button>
                );
              })}
            </div>

            <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <Select
                  label="Focus"
                  name="focus"
                  value={dayFocusId}
                  onChange={setDayFocusId}
                  options={[
                    { value: "", label: "None" },
                    ...(focuses ?? []).map((f) => ({ value: f.id, label: f.name }))
                  ]}
                />
              </div>
              <Button onClick={saveDay} disabled={loading}>
                Save day
              </Button>
            </div>

            <div>
              <div className="label">Coach note (optional)</div>
              <textarea className="input" style={{ marginTop: 8, minHeight: 90 }} value={dayNote} onChange={(e) => setDayNote(e.target.value)} />
            </div>

            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900 }}>Assignments</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  Structured drills (sets/reps/duration) + optional required upload prompts.
                </div>
              </div>
              <Button variant="primary" onClick={() => openAssignmentEditor()} disabled={loading || drills.length === 0}>
                Add assignment
              </Button>
            </div>

            {drills.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Create drills first in the Program library.
              </div>
            ) : assignmentsForDay.length ? (
              <div className="stack" style={{ gap: 10 }}>
                {assignmentsForDay.map((a) => {
                  const drill = drillById[a.drill_id];
                  return (
                    <div key={a.id} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{drill?.title ?? "Drill"}</div>
                        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                          {a.sets ? `${a.sets} sets` : null}
                          {a.reps ? `${a.sets ? " • " : ""}${a.reps} reps` : null}
                          {a.duration_min ? `${a.sets || a.reps ? " • " : ""}${a.duration_min} min` : null}
                          {a.requires_upload ? `${a.sets || a.reps || a.duration_min ? " • " : ""}Upload required` : ""}
                        </div>
                        {a.upload_prompt ? <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{a.upload_prompt}</div> : null}
                        {a.notes_to_player ? <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{a.notes_to_player}</div> : null}
                      </div>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Button onClick={() => openAssignmentEditor(a)} disabled={loading}>
                          Edit
                        </Button>
                        <Button variant="danger" onClick={() => deleteAssignment(a.id)} disabled={loading}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                No assignments yet for this day.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Legacy weekly notes</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Optional text notes (kept for backward compatibility).
              </div>
            </div>
            <Button onClick={() => openEditor(weekIdx)} disabled={loading}>
              Edit Week {weekIdx}
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={assignModal !== null}
        title={assignModal?.assignmentId ? "Edit assignment" : "New assignment"}
        onClose={() => (loading ? null : setAssignModal(null))}
        footer={
          <>
            <Button onClick={() => setAssignModal(null)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveAssignment} disabled={loading || !assignDrillId}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="stack">
          <Select
            label="Drill"
            name="drill"
            value={assignDrillId}
            onChange={setAssignDrillId}
            options={(drills ?? []).map((d) => ({ value: d.id, label: `${d.title}` }))}
          />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 120, flex: 1 }}>
              <Input label="Sets" name="sets" type="number" value={assignSets} onChange={setAssignSets} placeholder="3" />
            </div>
            <div style={{ minWidth: 120, flex: 1 }}>
              <Input label="Reps" name="reps" type="number" value={assignReps} onChange={setAssignReps} placeholder="10" />
            </div>
            <div style={{ minWidth: 140, flex: 1 }}>
              <Input label="Minutes" name="duration" type="number" value={assignDuration} onChange={setAssignDuration} placeholder="15" />
            </div>
          </div>
          <div className="row" style={{ alignItems: "center" }}>
            <input
              type="checkbox"
              checked={assignRequiresUpload}
              onChange={(e) => setAssignRequiresUpload(e.target.checked)}
              id="requiresUpload"
            />
            <label htmlFor="requiresUpload" style={{ marginLeft: 10 }}>
              Requires upload
            </label>
          </div>
          {assignRequiresUpload ? (
            <Input
              label="Upload prompt"
              name="uploadPrompt"
              value={assignUploadPrompt}
              onChange={setAssignUploadPrompt}
              placeholder="Front view, 10 swings"
            />
          ) : null}
          <div>
            <div className="label">Notes to player (optional)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 110 }} value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} />
          </div>
        </div>
      </Modal>

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


