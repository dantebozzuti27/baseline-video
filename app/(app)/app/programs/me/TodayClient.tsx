"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { toast } from "../../../toast";

type Focus = { id: string; name: string; description: string | null; cues: string[] };
type Drill = { id: string; title: string; category: string; goal: string | null; cues: string[]; mistakes: string[] };
type Media = {
  id: string;
  drill_id: string;
  kind: "internal_video" | "external_link";
  video_id: string | null;
  external_url: string | null;
  title: string | null;
  sort_order: number;
};
type Assignment = {
  id: string;
  drill_id: string;
  sets: number | null;
  reps: number | null;
  duration_min: number | null;
  requires_upload: boolean;
  upload_prompt: string;
  notes_to_player: string;
  sort_order: number;
};
type Completion = { assignment_id: string; completed_at: string };
type Submission = {
  id: string;
  assignment_id: string | null;
  created_at: string;
  video_id: string;
  note: string | null;
  video_title: string;
  video_category: string | null;
};

export default function TodayClient({
  programTitle,
  weekIndex,
  dayIndex,
  cycleDays,
  enrollmentId,
  focus,
  dayNote,
  drills,
  media,
  assignments,
  completions,
  submissions
}: {
  programTitle: string;
  weekIndex: number;
  dayIndex: number;
  cycleDays: number;
  enrollmentId: string;
  focus: Focus | null;
  dayNote: string;
  drills: Drill[];
  media: Media[];
  assignments: Assignment[];
  completions: Completion[];
  submissions: Submission[];
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const drillById = React.useMemo(() => {
    const m: Record<string, Drill> = {};
    for (const d of drills) m[d.id] = d;
    return m;
  }, [drills]);

  const mediaByDrillId = React.useMemo(() => {
    const m: Record<string, Media[]> = {};
    for (const x of media ?? []) {
      if (!m[x.drill_id]) m[x.drill_id] = [];
      m[x.drill_id].push(x);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return m;
  }, [media]);

  const doneSet = React.useMemo(() => new Set((completions ?? []).map((c) => c.assignment_id)), [completions]);
  const submissionsByAssignment = React.useMemo(() => {
    const m: Record<string, Submission[]> = {};
    for (const s of submissions ?? []) {
      if (!s.assignment_id) continue;
      if (!m[s.assignment_id]) m[s.assignment_id] = [];
      m[s.assignment_id].push(s);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return m;
  }, [submissions]);

  async function markDone(assignmentId: string) {
    setLoading(true);
    try {
      const resp = await fetch("/api/programs/assignments/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId })
      });
      if (resp.ok) {
        toast("Marked done.");
        router.refresh();
      }
    } catch (e) {
      console.error("mark done failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 860 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{programTitle}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Week {weekIndex} • Day {dayIndex} of {cycleDays}
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs/me/feed">
            Program feed
          </Link>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Today’s focus</div>
            {focus ? (
              <>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  <b>{focus.name}</b>
                </div>
                {focus.description ? <div className="muted" style={{ fontSize: 13 }}>{focus.description}</div> : null}
                {focus.cues?.length ? (
                  <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                    Cues: {focus.cues.join(" • ")}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                No focus set for today.
              </div>
            )}
            {dayNote ? (
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                {dayNote}
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Assignments</div>
            {(assignments ?? []).length ? (
              <div className="stack" style={{ gap: 12, marginTop: 10 }}>
                {(assignments ?? []).map((a) => {
                  const drill = drillById[a.drill_id];
                  const m = mediaByDrillId[a.drill_id] ?? [];
                  const subs = submissionsByAssignment[a.id] ?? [];
                  const done = doneSet.has(a.id);

                  const uploadQs = new URLSearchParams({
                    programEnrollmentId: enrollmentId,
                    programAssignmentId: a.id,
                    returnTo: "/app/programs/me"
                  });

                  return (
                    <div key={a.id} className="card">
                      <div className="stack" style={{ gap: 10 }}>
                        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>
                              {drill?.title ?? "Drill"} {done ? <span className="pill">Done</span> : null}
                            </div>
                            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                              {a.sets ? `${a.sets} sets` : null}
                              {a.reps ? `${a.sets ? " • " : ""}${a.reps} reps` : null}
                              {a.duration_min ? `${a.sets || a.reps ? " • " : ""}${a.duration_min} min` : null}
                              {a.requires_upload ? `${a.sets || a.reps || a.duration_min ? " • " : ""}Upload required` : ""}
                            </div>
                          </div>

                          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {a.requires_upload ? (
                              <Link className="btn btnPrimary" href={`/app/upload?${uploadQs.toString()}`}>
                                Submit video
                              </Link>
                            ) : (
                              <Button variant="primary" onClick={() => markDone(a.id)} disabled={loading}>
                                Mark done
                              </Button>
                            )}
                          </div>
                        </div>

                        {a.upload_prompt ? <div className="muted" style={{ fontSize: 13 }}>{a.upload_prompt}</div> : null}
                        {a.notes_to_player ? <div className="muted" style={{ fontSize: 13 }}>{a.notes_to_player}</div> : null}

                        {m.length ? (
                          <div className="stack" style={{ gap: 8 }}>
                            <div className="muted" style={{ fontSize: 13, fontWeight: 800 }}>Instruction</div>
                            {m.map((x) => (
                              <div key={x.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                                <div className="muted" style={{ fontSize: 13 }}>
                                  {x.title || (x.kind === "internal_video" ? "Instruction video" : "Instruction link")}
                                </div>
                                {x.kind === "internal_video" && x.video_id ? (
                                  <Link className="btn" href={`/app/videos/${x.video_id}`}>
                                    Open
                                  </Link>
                                ) : x.external_url ? (
                                  <a className="btn" href={x.external_url} target="_blank" rel="noreferrer">
                                    Open
                                  </a>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="stack" style={{ gap: 8 }}>
                          <div className="muted" style={{ fontSize: 13, fontWeight: 800 }}>
                            Your submissions {subs.length ? `(${subs.length})` : ""}
                          </div>
                          {subs.length ? (
                            subs.slice(0, 5).map((s) => (
                              <div key={s.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                                <div className="muted" style={{ fontSize: 13 }}>{s.video_title}</div>
                                <Link className="btn" href={`/app/videos/${s.video_id}`}>
                                  Open
                                </Link>
                              </div>
                            ))
                          ) : (
                            <div className="muted" style={{ fontSize: 13 }}>No videos submitted yet.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                No assignments set for today.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}


