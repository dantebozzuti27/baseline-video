"use client";

import * as React from "react";
import { Button, Card, Select } from "@/components/ui";
import { toast } from "../../toast";

type Role = "coach" | "player";
type Lesson = {
  id: string;
  coach_user_id: string | null;
  player_user_id: string | null;
  mode: "in_person" | "remote";
  start_at: string;
  end_at: string;
  timezone: string;
  status: "requested" | "approved" | "declined" | "cancelled";
  notes: string | null;
  coach_response_note: string | null;
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

export default function LessonsClient({
  role,
  myUserId,
  coaches,
  peopleById,
  lessons
}: {
  role: Role;
  myUserId: string;
  coaches: Array<{ user_id: string; display_name: string }>;
  peopleById: Record<string, { display_name: string; role: Role }>;
  lessons: Lesson[];
}) {
  const tz = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const [coachUserId, setCoachUserId] = React.useState<string>(coaches[0]?.user_id ?? "");
  const [mode, setMode] = React.useState<"in_person" | "remote">("in_person");
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

  const pending = lessons.filter((l) => l.status === "requested");
  const upcoming = lessons
    .filter((l) => l.status === "approved" && new Date(l.end_at).getTime() >= Date.now() - 10 * 60 * 1000)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  const history = lessons
    .filter((l) => l.status !== "approved" || new Date(l.end_at).getTime() < Date.now() - 10 * 60 * 1000)
    .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
    .slice(0, 40);

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

    const start = new Date(startLocal);
    if (!Number.isFinite(start.getTime())) {
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
          notes: notes.trim() || undefined
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

  function personLabel(userId: string | null) {
    if (!userId) return "User";
    return peopleById[userId]?.display_name ?? "User";
  }

  return (
    <div className="stack">
      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Lessons</div>
        <div className="muted" style={{ marginTop: 6 }}>
          {role === "coach" ? "Approve requests and keep your schedule clean." : "Request a lesson and track approvals."}
        </div>
      </div>

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
                        <div style={{ fontWeight: 900 }}>{personLabel(l.player_user_id)}</div>
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
                      </div>
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

      <Card>
        <div className="stack">
          <div style={{ fontWeight: 900 }}>Upcoming</div>
          {upcoming.length ? (
            <div className="stack" style={{ marginTop: 12 }}>
              {upcoming.map((l) => (
                <div key={l.id} className="card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>
                        {role === "coach" ? personLabel(l.player_user_id) : personLabel(l.coach_user_id)}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {fmt(l.start_at)} • {minutesBetween(l.start_at, l.end_at) ?? "?"} min • {l.mode === "remote" ? "Remote" : "In-person"}
                      </div>
                    </div>
                    <div className="row" style={{ alignItems: "center" }}>
                      <div className="pill">APPROVED</div>
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
                      <div style={{ fontWeight: 900 }}>
                        {role === "coach" ? personLabel(l.player_user_id) : personLabel(l.coach_user_id)}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {fmt(l.start_at)} • {minutesBetween(l.start_at, l.end_at) ?? "?"} min • {l.mode === "remote" ? "Remote" : "In-person"}
                      </div>
                    </div>
                    <div className="row" style={{ alignItems: "center" }}>
                      <div className="pill">{String(l.status).toUpperCase()}</div>
                      {l.status !== "cancelled" ? (
                        <Button disabled={loading} onClick={() => cancel(l.id)}>
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {l.coach_response_note ? (
                    <div className="muted" style={{ marginTop: 10, fontSize: 13, whiteSpace: "pre-wrap" }}>
                      Coach note: {l.coach_response_note}
                    </div>
                  ) : null}
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
    </div>
  );
}


