"use client";

import * as React from "react";
import { Button, Card, Select } from "@/components/ui";
import { toast } from "../../toast";

type Role = "coach" | "player";
type Lesson = {
  id: string;
  coach_user_id: string | null;
  created_by_user_id: string | null;
  mode: "in_person" | "remote";
  start_at: string;
  end_at: string;
  timezone: string;
  status: "requested" | "approved" | "declined" | "cancelled";
  notes: string | null;
  coach_response_note: string | null;
};

type Block = {
  id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  note: string | null;
};

type Participant = {
  lesson_id: string;
  user_id: string;
  invite_status: "invited" | "accepted" | "declined";
  is_primary: boolean;
};

function fmt(dtIso: string) {
  try {
    const d = new Date(dtIso);
    return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return dtIso;
  }
}

function minutesBetween(startIso: string, endIso: string) {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 60000);
}

function parseLocalDateTime(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  // Accept YYYY-MM-DDTHH:mm (datetime-local)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  // Fallback: let Date try.
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // Mon=0
  x.setDate(x.getDate() - diff);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function LessonsClient({
  role,
  myUserId,
  coaches,
  players,
  peopleById,
  lessons,
  participants,
  blocks
}: {
  role: Role;
  myUserId: string;
  coaches: Array<{ user_id: string; display_name: string }>;
  players: Array<{ user_id: string; display_name: string }>;
  peopleById: Record<string, { display_name: string; role: Role }>;
  lessons: Lesson[];
  participants: Participant[];
  blocks: Block[];
}) {
  const tz = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const [view, setView] = React.useState<"week" | "list">("week");
  const [weekStart, setWeekStart] = React.useState<Date>(() => startOfWeekMonday(new Date()));
  const [selectedLessonId, setSelectedLessonId] = React.useState<string | null>(null);

  const [coachUserId, setCoachUserId] = React.useState<string>(coaches[0]?.user_id ?? "");
  const [mode, setMode] = React.useState<"in_person" | "remote">("in_person");
  const [secondPlayerUserId, setSecondPlayerUserId] = React.useState<string>("");
  const [startLocal, setStartLocal] = React.useState<string>(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return iso;
  });
  const [minutes, setMinutes] = React.useState<number>(60);
  const [notes, setNotes] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [blockStartLocal, setBlockStartLocal] = React.useState<string>(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [blockMinutes, setBlockMinutes] = React.useState<number>(60);
  const [blockNote, setBlockNote] = React.useState<string>("");

  const pending = lessons.filter((l) => l.status === "requested");
  const upcoming = lessons
    .filter((l) => l.status === "approved" && new Date(l.end_at).getTime() >= Date.now() - 10 * 60 * 1000)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  const history = lessons
    .filter((l) => l.status !== "approved" || new Date(l.end_at).getTime() < Date.now() - 10 * 60 * 1000)
    .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
    .slice(0, 40);

  const participantsByLesson = React.useMemo(() => {
    const m = new Map<string, Participant[]>();
    for (const p of participants) {
      const arr = m.get(p.lesson_id) ?? [];
      arr.push(p);
      m.set(p.lesson_id, arr);
    }
    return m;
  }, [participants]);

  function myInviteStatus(lessonId: string) {
    const ps = participantsByLesson.get(lessonId) ?? [];
    return ps.find((p) => p.user_id === myUserId) ?? null;
  }

  function primaryPlayerId(lessonId: string) {
    const ps = participantsByLesson.get(lessonId) ?? [];
    return ps.find((p) => p.is_primary)?.user_id ?? null;
  }

  function playersLabel(lessonId: string) {
    const ps = participantsByLesson.get(lessonId) ?? [];
    const names = ps
      .map((p) => peopleById[p.user_id]?.display_name ?? "Player")
      .filter(Boolean);
    return names.length ? names.join(" + ") : "Players";
  }

  function lessonTitle(l: Lesson) {
    if (role === "coach") return playersLabel(l.id);
    const coachName = l.coach_user_id ? personLabel(l.coach_user_id) : "Coach";
    const ps = participantsByLesson.get(l.id) ?? [];
    const isTwoOnOne = ps.filter((p) => !p.is_primary).length > 0;
    return isTwoOnOne ? `2-on-1 with ${coachName}` : `Lesson with ${coachName}`;
  }

  const weekDays = React.useMemo(() => new Array(7).fill(0).map((_, i) => addDays(weekStart, i)), [weekStart]);

  const startHour = 6;
  const endHour = 21;
  const hours = React.useMemo(() => new Array(endHour - startHour + 1).fill(0).map((_, i) => startHour + i), []);

  const weekLessons = React.useMemo(() => {
    const start = new Date(weekStart);
    const end = addDays(start, 7);
    const a = start.getTime();
    const b = end.getTime();
    return lessons.filter((l) => {
      const s = new Date(l.start_at).getTime();
      const e = new Date(l.end_at).getTime();
      return Number.isFinite(s) && Number.isFinite(e) && e > a && s < b && (l.status === "approved" || l.status === "requested");
    });
  }, [lessons, weekStart]);

  const weekBlocks = React.useMemo(() => {
    const start = new Date(weekStart);
    const end = addDays(start, 7);
    const a = start.getTime();
    const b = end.getTime();
    return (blocks ?? []).filter((bl) => {
      const s = new Date(bl.start_at).getTime();
      const e = new Date(bl.end_at).getTime();
      return Number.isFinite(s) && Number.isFinite(e) && e > a && s < b;
    });
  }, [blocks, weekStart]);

  async function requestLesson() {
    setError(null);
    if (!coachUserId) {
      setError("Choose a coach.");
      return;
    }
    if (!startLocal) {
      setError("Choose a time.");
      return;
    }

    const start = parseLocalDateTime(startLocal);
    if (!start || !Number.isFinite(start.getTime())) {
      setError("Choose a valid time.");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch("/api/lessons/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachUserId,
          mode,
          startAt: start.toISOString(),
          minutes,
          timezone: tz,
          notes: notes.trim() || undefined,
          secondPlayerUserId: secondPlayerUserId || undefined
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to request lesson.");
      toast("Lesson requested.");
      window.location.reload();
    } catch (e: any) {
      const msg = e?.message ?? "Unable to request lesson.";
      setError(msg);
      toast(msg);
    } finally {
      setLoading(false);
    }
  }

  async function respondInvite(id: string, accept: boolean) {
    setLoading(true);
    try {
      const resp = await fetch(`/api/lessons/${id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to respond.");
      toast(accept ? "Invite accepted." : "Invite declined.");
      window.location.reload();
    } catch (e: any) {
      toast(e?.message ?? "Unable to respond.");
    } finally {
      setLoading(false);
    }
  }

  async function coachSetSecond(lessonId: string, playerUserId: string, present: boolean) {
    setLoading(true);
    try {
      const resp = await fetch(`/api/lessons/${lessonId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerUserId, present })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to update participants.");
      toast(present ? "Player invited." : "Player removed.");
      window.location.reload();
    } catch (e: any) {
      toast(e?.message ?? "Unable to update participants.");
    } finally {
      setLoading(false);
    }
  }

  async function respond(id: string, approve: boolean) {
    const note = window.prompt(approve ? "Optional note for the player (leave blank if none):" : "Optional decline note:");
    setLoading(true);
    try {
      const resp = await fetch(`/api/lessons/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, note: note?.trim() || undefined })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to update request.");
      toast(approve ? "Lesson approved." : "Lesson declined.");
      window.location.reload();
    } catch (e: any) {
      const msg = e?.message ?? "Unable to update request.";
      toast(msg);
    } finally {
      setLoading(false);
    }
  }

  async function cancel(id: string) {
    const ok = window.confirm("Cancel this lesson?");
    if (!ok) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/lessons/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to cancel lesson.");
      toast("Lesson cancelled.");
      window.location.reload();
    } catch (e: any) {
      toast(e?.message ?? "Unable to cancel lesson.");
    } finally {
      setLoading(false);
    }
  }

  async function reschedule(id: string) {
    const start = window.prompt("New start time (YYYY-MM-DDTHH:mm). Example: 2026-01-03T14:00");
    if (!start) return;
    const minsRaw = window.prompt("Duration minutes (15–180)", "60");
    if (!minsRaw) return;
    const mins = Number(minsRaw);
    if (!Number.isFinite(mins) || mins < 15 || mins > 180) {
      toast("Invalid duration.");
      return;
    }
    const note = window.prompt("Optional note (leave blank if none):") ?? "";

    setLoading(true);
    try {
      const startDt = parseLocalDateTime(start);
      if (!startDt) throw new Error("Invalid start time.");
      const resp = await fetch(`/api/lessons/${id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt: startDt.toISOString(),
          minutes: mins,
          timezone: tz,
          note: note.trim() || undefined
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to reschedule.");
      toast(role === "coach" ? "Lesson rescheduled." : "Reschedule requested.");
      window.location.reload();
    } catch (e: any) {
      toast(e?.message ?? "Unable to reschedule.");
    } finally {
      setLoading(false);
    }
  }

  async function createBlock() {
    setLoading(true);
    try {
      const start = new Date(blockStartLocal);
      if (!Number.isFinite(start.getTime())) throw new Error("Choose a valid time.");
      const resp = await fetch("/api/lessons/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt: start.toISOString(),
          minutes: blockMinutes,
          timezone: tz,
          note: blockNote.trim() || undefined
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to block time.");
      toast("Time blocked off.");
      window.location.reload();
    } catch (e: any) {
      toast(e?.message ?? "Unable to block time.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteBlock(id: string) {
    const ok = window.confirm("Remove this blocked time?");
    if (!ok) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/lessons/blocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to remove blocked time.");
      toast("Blocked time removed.");
      window.location.reload();
    } catch (e: any) {
      toast(e?.message ?? "Unable to remove blocked time.");
    } finally {
      setLoading(false);
    }
  }

  function personLabel(userId: string | null) {
    if (!userId) return "User";
    return peopleById[userId]?.display_name ?? "User";
  }

  function isInHourRange(dtIso: string) {
    const d = new Date(dtIso);
    const h = d.getHours() + d.getMinutes() / 60;
    return h >= startHour && h <= endHour + 1;
  }

  function topFor(dt: Date) {
    const mins = dt.getHours() * 60 + dt.getMinutes();
    const startMins = startHour * 60;
    return Math.round(((mins - startMins) / 60) * 56); // 56px per hour
  }

  function heightForMinutes(mins: number) {
    return Math.max(22, Math.round((mins / 60) * 56));
  }

  const selectedLesson = selectedLessonId ? lessons.find((l) => l.id === selectedLessonId) ?? null : null;

  return (
    <div className="stack">
      <div className="bvCalTop">
        <div className="bvCalTitle">
          <div style={{ fontSize: 18, fontWeight: 900 }}>Lessons</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {role === "coach" ? "Your schedule and requests." : "Request lessons and track invites."} • {tz}
          </div>
        </div>
        <div className="bvCalToolbar">
          <Button
            onClick={() => {
              setWeekStart(startOfWeekMonday(new Date()));
            }}
          >
            Today
          </Button>
          <Button onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</Button>
          <Button onClick={() => setWeekStart(addDays(weekStart, 7))}>›</Button>
          <div className="pill" style={{ userSelect: "none" }}>
            {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
            {addDays(weekStart, 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
          <Button variant={view === "week" ? "primary" : "default"} onClick={() => setView("week")}>
            Week
          </Button>
          <Button variant={view === "list" ? "primary" : "default"} onClick={() => setView("list")}>
            List
          </Button>
        </div>
      </div>

      {view === "week" ? (
        <div className="bvCalWrap">
          <div className="bvCalGrid">
            <div className="bvCalHeader">
              <div className="bvCalHeaderGutter" />
              {weekDays.map((d) => {
                const isToday = sameDay(d, new Date());
                return (
                  <div key={d.toISOString()} className={isToday ? "bvCalHeaderDay bvCalHeaderDayToday" : "bvCalHeaderDay"}>
                    <div className="bvCalDow">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div className="bvCalDom">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            <div className="bvCalBody">
              <div className="bvCalTimes">
                {hours.map((h) => (
                  <div key={h} className="bvCalTimeRow">
                    <div className="bvCalTimeLabel">
                      {new Date(0, 0, 0, h).toLocaleTimeString(undefined, { hour: "numeric" })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bvCalDays">
                {weekDays.map((day) => {
                  const dayKey = day.toISOString();
                  const dayStart = new Date(day);
                  dayStart.setHours(0, 0, 0, 0);
                  const dayEnd = addDays(dayStart, 1);

                  const dayLessons = weekLessons.filter((l) => {
                    const s = new Date(l.start_at);
                    return s >= dayStart && s < dayEnd;
                  });
                  const dayBlocks = weekBlocks.filter((b) => {
                    const s = new Date(b.start_at);
                    return s >= dayStart && s < dayEnd;
                  });

                  return (
                    <div key={dayKey} className="bvCalDayCol">
                      {hours.map((h) => (
                        <div key={h} className="bvCalHourLine" />
                      ))}

                      {dayBlocks.map((b) => {
                        const s = new Date(b.start_at);
                        const e = new Date(b.end_at);
                        if (!isInHourRange(b.start_at) && !isInHourRange(b.end_at)) return null;
                        const top = topFor(s);
                        const mins = Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000));
                        return (
                          <button
                            key={b.id}
                            className="bvCalEvent bvCalBlock"
                            style={{ top, height: heightForMinutes(mins) }}
                            onClick={() => {
                              if (role === "coach") deleteBlock(b.id);
                            }}
                            type="button"
                            title={role === "coach" ? "Click to remove block" : "Blocked time"}
                          >
                            <div className="bvCalEventTitle">Blocked</div>
                            {b.note ? <div className="bvCalEventSub">{b.note}</div> : null}
                          </button>
                        );
                      })}

                      {dayLessons.map((l) => {
                        const s = new Date(l.start_at);
                        const e = new Date(l.end_at);
                        if (!isInHourRange(l.start_at) && !isInHourRange(l.end_at)) return null;
                        const top = topFor(s);
                        const mins = Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000));
                        const mine = myInviteStatus(l.id);
                        const statusPill =
                          l.status === "approved"
                            ? "APPROVED"
                            : l.status === "requested"
                              ? "REQUESTED"
                              : l.status.toUpperCase();
                        const invitePill =
                          role === "player" && mine && !mine.is_primary ? mine.invite_status.toUpperCase() : null;
                        return (
                          <button
                            key={l.id}
                            className={selectedLessonId === l.id ? "bvCalEvent bvCalEventSelected" : "bvCalEvent"}
                            style={{ top, height: heightForMinutes(mins) }}
                            onClick={() => setSelectedLessonId(l.id)}
                            type="button"
                          >
                            <div className="bvCalEventTitle">{lessonTitle(l)}</div>
                            <div className="bvCalEventSub">
                              {statusPill}
                              {invitePill ? ` • ${invitePill}` : ""} • {l.mode === "remote" ? "Remote" : "In-person"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bvCalSide">
            <Card>
              <div className="stack">
                <div style={{ fontWeight: 900 }}>Details</div>
                {selectedLesson ? (
                  <>
                    <div style={{ fontWeight: 800 }}>{lessonTitle(selectedLesson)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {fmt(selectedLesson.start_at)} • {minutesBetween(selectedLesson.start_at, selectedLesson.end_at) ?? "?"} min
                    </div>
                    <div className="row" style={{ alignItems: "center" }}>
                      <div className="pill">{selectedLesson.status.toUpperCase()}</div>
                      <div className="pill">{selectedLesson.mode === "remote" ? "REMOTE" : "IN-PERSON"}</div>
                    </div>
                    <div className="stack" style={{ gap: 8 }}>
                      <Button disabled={loading} onClick={() => reschedule(selectedLesson.id)}>
                        Reschedule
                      </Button>
                      <Button disabled={loading} onClick={() => cancel(selectedLesson.id)}>
                        Cancel
                      </Button>
                      {(() => {
                        const mine = myInviteStatus(selectedLesson.id);
                        if (role === "player" && mine && !mine.is_primary && mine.invite_status === "invited") {
                          return (
                            <div className="row">
                              <Button disabled={loading} variant="primary" onClick={() => respondInvite(selectedLesson.id, true)}>
                                Accept invite
                              </Button>
                              <Button disabled={loading} onClick={() => respondInvite(selectedLesson.id, false)}>
                                Decline
                              </Button>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </>
                ) : (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Click a lesson on the calendar to see details and actions.
                  </div>
                )}
              </div>
            </Card>

            {role === "coach" ? (
              <Card>
                <div className="stack">
                  <div style={{ fontWeight: 900 }}>Block off time</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Shows as “Blocked” on your calendar. Click a blocked block to remove it.
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="label">Start</div>
                    <input
                      className="input"
                      type="datetime-local"
                      value={blockStartLocal}
                      onChange={(e) => setBlockStartLocal(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <Select
                    label="Duration"
                    name="blockMinutes"
                    value={String(blockMinutes)}
                    onChange={(v) => setBlockMinutes(Number(v))}
                    options={[
                      { value: "30", label: "30 min" },
                      { value: "60", label: "60 min" },
                      { value: "90", label: "90 min" },
                      { value: "120", label: "120 min" }
                    ]}
                  />
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="label">Note (optional)</div>
                    <textarea className="textarea" rows={2} value={blockNote} onChange={(e) => setBlockNote(e.target.value)} />
                  </div>
                  <Button variant="primary" disabled={loading} onClick={createBlock}>
                    {loading ? "Saving…" : "Block time"}
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {role === "player" ? (
        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Request a lesson</div>

            <Select
              label="Coach"
              name="coachUserId"
              value={coachUserId}
              onChange={(v) => setCoachUserId(v)}
              options={coaches.map((c) => ({ value: c.user_id, label: c.display_name }))}
            />

            <Select
              label="Mode"
              name="mode"
              value={mode}
              onChange={(v) => setMode(v as any)}
              options={[
                { value: "in_person", label: "In-person" },
                { value: "remote", label: "Remote" }
              ]}
            />

            <div className="stack" style={{ gap: 6 }}>
              <div className="label">Start time</div>
              <input className="input" type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
              <div className="muted" style={{ fontSize: 12 }}>
                Timezone: {tz}
              </div>
            </div>

            <Select
              label="Duration"
              name="minutes"
              value={String(minutes)}
              onChange={(v) => setMinutes(Number(v))}
              options={[
                { value: "30", label: "30 min" },
                { value: "45", label: "45 min" },
                { value: "60", label: "60 min" },
                { value: "90", label: "90 min" }
              ]}
            />

            <Select
              label="Second player (optional)"
              name="secondPlayerUserId"
              value={secondPlayerUserId}
              onChange={(v) => setSecondPlayerUserId(v)}
              options={[
                { value: "", label: "None" },
                ...players.filter((p) => p.user_id !== myUserId).map((p) => ({ value: p.user_id, label: p.display_name }))
              ]}
            />

            <div className="stack" style={{ gap: 6 }}>
              <div className="label">Note (optional)</div>
              <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What should the coach focus on?" />
            </div>

            {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <Button variant="primary" disabled={loading} onClick={requestLesson}>
                {loading ? "Submitting…" : "Request"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {role === "coach" ? (
        <Card>
          <div className="stack">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900 }}>Pending requests</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  Approve or decline.
                </div>
              </div>
              <div className="pill">{pending.length}</div>
            </div>

            {pending.length ? (
              <div className="stack" style={{ marginTop: 12 }}>
                {pending.map((l) => (
                  <div key={l.id} className="card">
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{playersLabel(l.id)}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                          {fmt(l.start_at)} • {minutesBetween(l.start_at, l.end_at) ?? "?"} min • {l.mode === "remote" ? "Remote" : "In-person"}
                        </div>
                      </div>
                      <div className="row" style={{ alignItems: "center" }}>
                        <Button disabled={loading} onClick={() => respond(l.id, false)}>
                          Decline
                        </Button>
                        <Button variant="primary" disabled={loading} onClick={() => respond(l.id, true)}>
                          Approve
                        </Button>
                      <Button disabled={loading} onClick={() => reschedule(l.id)}>
                        Reschedule
                      </Button>
                      </div>
                    </div>
                    <div className="row" style={{ alignItems: "center", flexWrap: "wrap", marginTop: 10, gap: 8 }}>
                      {(participantsByLesson.get(l.id) ?? [])
                        .filter((p) => !p.is_primary)
                        .map((p) => (
                          <div key={p.user_id} className="pill">
                            {personLabel(p.user_id)} • {p.invite_status.toUpperCase()}
                          </div>
                        ))}
                    </div>
                    <div className="row" style={{ alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <select
                        className="select"
                        disabled={loading}
                        defaultValue=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          coachSetSecond(l.id, v, true);
                          e.currentTarget.value = "";
                        }}
                      >
                        <option value="">Add second player…</option>
                        {players
                          .filter((p) => {
                            const ps = participantsByLesson.get(l.id) ?? [];
                            return !ps.some((x) => x.user_id === p.user_id);
                          })
                          .map((p) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.display_name}
                            </option>
                          ))}
                      </select>
                      {(participantsByLesson.get(l.id) ?? [])
                        .filter((p) => !p.is_primary)
                        .map((p) => (
                          <Button key={p.user_id} disabled={loading} onClick={() => coachSetSecond(l.id, p.user_id, false)}>
                            Remove {personLabel(p.user_id)}
                          </Button>
                        ))}
                    </div>
                    {l.notes ? (
                      <div className="muted" style={{ marginTop: 10, fontSize: 13, whiteSpace: "pre-wrap" }}>
                        {l.notes}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 12 }}>
                No pending requests.
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {view === "list" ? (
        <>
          <Card>
            <div className="stack">
              <div style={{ fontWeight: 900 }}>Upcoming</div>
              {upcoming.length ? (
                <div className="stack" style={{ marginTop: 12 }}>
                  {upcoming.map((l) => (
                    <div key={l.id} className="card">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 900 }}>{lessonTitle(l)}</div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            {fmt(l.start_at)} • {minutesBetween(l.start_at, l.end_at) ?? "?"} min
                          </div>
                        </div>
                        <div className="row" style={{ alignItems: "center" }}>
                          <div className="pill">{l.status.toUpperCase()}</div>
                          <Button disabled={loading} onClick={() => reschedule(l.id)}>
                            Reschedule
                          </Button>
                          <Button disabled={loading} onClick={() => cancel(l.id)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 10 }}>
                  No upcoming lessons.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="stack">
              <div style={{ fontWeight: 900 }}>Recent</div>
              {history.length ? (
                <div className="stack" style={{ marginTop: 12 }}>
                  {history.map((l) => (
                    <div key={l.id} className="card">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 900 }}>{lessonTitle(l)}</div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            {fmt(l.start_at)} • {minutesBetween(l.start_at, l.end_at) ?? "?"} min
                          </div>
                        </div>
                        <div className="row" style={{ alignItems: "center" }}>
                          <div className="pill">{l.status.toUpperCase()}</div>
                          <Button disabled={loading} onClick={() => reschedule(l.id)}>
                            Reschedule
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 10 }}>
                  No lesson history yet.
                </div>
              )}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}


