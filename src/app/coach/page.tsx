"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Player = {
  id: string;
  name: string;
  email?: string | null;
  status: string;
};

type Media = {
  id: string;
  type: string;
  mirroredObjectStoreUrl?: string | null;
  googleDriveWebViewLink: string;
  durationSeconds?: number | null;
  createdAt: string;
};

type Lesson = {
  id: string;
  playerId: string;
  category: string;
  date: string;
  notes?: string | null;
  media: Media[];
};

type Coach = {
  id: string;
  name: string;
  email: string;
};

export default function CoachPage() {
  const [coachId, setCoachId] = useState("");
  const [token, setToken] = useState("");
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCoach, setNewCoach] = useState({
    name: "",
    email: "",
    authProviderId: "",
  });

  const [newPlayer, setNewPlayer] = useState({
    name: "",
    email: "",
  });

  const [newLesson, setNewLesson] = useState({
    playerId: "",
    date: "",
    category: "",
    notes: "",
  });

  const sortedLessons = useMemo(
    () =>
      [...lessons].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [lessons],
  );

  const fetchCoaches = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/coaches", {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      setCoaches(data.coaches ?? []);
    } catch (err) {
      setError("Failed to load coaches");
      console.error(err);
    }
  }, [token]);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("coachToken") || "" : "";
    setToken(t);
  }, []);

  useEffect(() => {
    void fetchCoaches();
  }, [fetchCoaches]);

  async function fetchPlayers(coach: string) {
    setError(null);
    try {
      const res = await fetch(`/api/players?coachId=${coach}`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      setPlayers(data.players ?? []);
    } catch (err) {
      setError("Failed to load players");
      console.error(err);
    }
  }

  async function fetchLessons(coach: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/lessons?coachId=${coach}`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      setLessons(data.lessons ?? []);
    } catch (err) {
      setError("Failed to load lessons");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCoach() {
    setError(null);
    try {
      const res = await fetch("/api/coaches", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(newCoach),
      });
      if (!res.ok) throw new Error("Failed to create coach");
      setNewCoach({ name: "", email: "", authProviderId: "" });
      await fetchCoaches();
    } catch (err) {
      setError("Could not create coach");
      console.error(err);
    }
  }

  async function handleCreatePlayer() {
    if (!coachId) {
      setError("Select a coach first");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          coachId,
          name: newPlayer.name,
          email: newPlayer.email || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create player");
      setNewPlayer({ name: "", email: "" });
      await fetchPlayers(coachId);
    } catch (err) {
      setError("Could not create player");
      console.error(err);
    }
  }

  async function handleCreateLesson() {
    if (!coachId) {
      setError("Select a coach first");
      return;
    }
    if (!newLesson.playerId) {
      setError("Select a player");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          coachId,
          playerId: newLesson.playerId,
          date: new Date(newLesson.date).toISOString(),
          category: newLesson.category,
          notes: newLesson.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create lesson");
      setNewLesson({ playerId: "", date: "", category: "", notes: "" });
      await fetchLessons(coachId);
    } catch (err) {
      setError("Could not create lesson");
      console.error(err);
    }
  }

  async function refreshData(selectedCoach: string) {
    setCoachId(selectedCoach);
    await Promise.all([fetchPlayers(selectedCoach), fetchLessons(selectedCoach)]);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Coach workspace
        </p>
        <h1 className="text-2xl font-bold">Player timelines</h1>
        <p className="text-sm text-zinc-600">
          Create a coach, add players, then create lessons. Data is live from the
          API (no mocks).
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Step 1 — Coach
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              API token (bearer)
            </label>
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Paste coach token"
              value={token}
              onChange={(e) => {
                const t = e.target.value;
                setToken(t);
                if (typeof window !== "undefined") {
                  localStorage.setItem("coachToken", t);
                }
              }}
            />
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Name"
              value={newCoach.name}
              onChange={(e) => setNewCoach({ ...newCoach, name: e.target.value })}
            />
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Email"
              value={newCoach.email}
              onChange={(e) =>
                setNewCoach({ ...newCoach, email: e.target.value })
              }
            />
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Auth provider id (e.g., auth0|user)"
              value={newCoach.authProviderId}
              onChange={(e) =>
                setNewCoach({ ...newCoach, authProviderId: e.target.value })
              }
            />
            <button
              className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white"
              onClick={handleCreateCoach}
            >
              Create coach
            </button>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Coaches
            </p>
            <div className="mt-2 space-y-1">
              {coaches.map((c) => (
                <button
                  key={c.id}
                  onClick={() => refreshData(c.id)}
                  className={`flex w-full justify-between rounded-md border px-3 py-2 text-left text-sm ${
                    coachId === c.id ? "border-blue-500 bg-blue-50" : ""
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-zinc-500">select</span>
                </button>
              ))}
              {coaches.length === 0 && (
                <p className="text-sm text-zinc-500">No coaches yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Step 2 — Players
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Name"
              value={newPlayer.name}
              onChange={(e) =>
                setNewPlayer({ ...newPlayer, name: e.target.value })
              }
            />
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Email (optional)"
              value={newPlayer.email}
              onChange={(e) =>
                setNewPlayer({ ...newPlayer, email: e.target.value })
              }
            />
            <button
              className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white"
              onClick={handleCreatePlayer}
              disabled={!coachId}
            >
              Create player
            </button>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Players
            </p>
            <div className="mt-2 space-y-1">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="rounded-md border px-3 py-2 text-sm text-zinc-700"
                >
                  {p.name}
                  <p className="text-xs text-zinc-500">{p.email || "—"}</p>
                </div>
              ))}
              {players.length === 0 && (
                <p className="text-sm text-zinc-500">No players yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Step 3 — Lessons
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={newLesson.playerId}
              onChange={(e) =>
                setNewLesson({ ...newLesson, playerId: e.target.value })
              }
            >
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="rounded-md border px-3 py-2 text-sm"
              value={newLesson.date}
              onChange={(e) =>
                setNewLesson({ ...newLesson, date: e.target.value })
              }
            />
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Category (e.g., Hitting)"
              value={newLesson.category}
              onChange={(e) =>
                setNewLesson({ ...newLesson, category: e.target.value })
              }
            />
            <textarea
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Notes"
              value={newLesson.notes}
              onChange={(e) =>
                setNewLesson({ ...newLesson, notes: e.target.value })
              }
            />
            <button
              className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white"
              onClick={handleCreateLesson}
              disabled={!coachId}
            >
              Create lesson
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Lessons</h2>
          {loading && <p className="text-xs text-zinc-500">Loading…</p>}
        </div>
        {sortedLessons.map((lesson) => (
          <article
            key={lesson.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  {lesson.category}
                </p>
                <h2 className="text-lg font-semibold">
                  {players.find((p) => p.id === lesson.playerId)?.name ??
                    "Player"}{" "}
                  — {new Date(lesson.date).toLocaleDateString()}
                </h2>
              </div>
              <a
                href={`/lessons/${lesson.id}`}
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                Open lesson
              </a>
            </div>
            <p className="mt-2 text-sm text-zinc-700">
              {lesson.notes || "No notes yet."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {lesson.media.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700"
                >
                  {m.type} •{" "}
                  {m.mirroredObjectStoreUrl ? "mirrored" : "drive-only"}
                  {m.durationSeconds ? ` • ${m.durationSeconds}s` : ""}
                </span>
              ))}
              {lesson.media.length === 0 && (
                <span className="text-xs text-zinc-500">
                  No media registered yet.
                </span>
              )}
            </div>
          </article>
        ))}
        {sortedLessons.length === 0 && (
          <p className="text-sm text-zinc-500">
            No lessons yet. Create a coach, add a player, then add a lesson.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}

