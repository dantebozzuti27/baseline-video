"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";

export const dynamic = "force-dynamic";

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
  const { status, data: session } = useSession();
  const [coachId, setCoachId] = useState("");
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCoach, setNewCoach] = useState({
    name: "",
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
    if (status !== "authenticated") return;
    setError(null);
    try {
      const res = await fetch("/api/coaches", {
        cache: "no-store",
      });
      const data = await res.json();
      setCoaches(data.coaches ?? []);
    } catch (err) {
      setError("Failed to load coaches");
      console.error(err);
    }
  }, [status]);

  useEffect(() => {
    void fetchCoaches();
  }, [fetchCoaches]);

  async function fetchPlayers(coach: string) {
    setError(null);
    try {
      const res = await fetch(`/api/players?coachId=${coach}`, {
        cache: "no-store",
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
    if (status !== "authenticated") {
      setError("Sign in first");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/coaches", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: newCoach.name,
          authProviderId: newCoach.authProviderId || session?.user?.email || "google",
        }),
      });
      if (!res.ok) throw new Error("Failed to create coach");
      setNewCoach({ name: "", authProviderId: "" });
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
        },
        body: JSON.stringify({
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
        },
        body: JSON.stringify({
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
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="rounded-3xl bg-white/80 p-7 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.25)] backdrop-blur">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Coach workspace
            </p>
            <h1 className="text-3xl font-semibold text-zinc-900">
              Run your roster with calm controls
            </h1>
            <p className="text-sm text-zinc-600">
              Authenticate once, then add coaches, players, and lessons with focused, low-noise forms.
            </p>
          </div>
        </header>

        {status !== "authenticated" ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm text-center">
            <p className="text-sm text-zinc-700">Sign in to manage coaches, players, and lessons.</p>
            <button
              className="mt-3 inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => signIn("google", { callbackUrl: "/coach" })}
            >
              Continue with Google
            </button>
          </div>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Create coach
                </p>
                <input
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Name"
                  value={newCoach.name}
                  onChange={(e) => setNewCoach({ ...newCoach, name: e.target.value })}
                />
                <input
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Auth provider id (optional)"
                  value={newCoach.authProviderId}
                  onChange={(e) => setNewCoach({ ...newCoach, authProviderId: e.target.value })}
                />
                <button
                  className="w-full rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg"
                  onClick={handleCreateCoach}
                >
                  Save coach
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Coaches
                </p>
                <div className="mt-3 space-y-2">
                  {coaches.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => refreshData(c.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                        coachId === c.id ? "border-blue-500 bg-blue-50" : "border-zinc-200 bg-white"
                      }`}
                    >
                      <span className="font-medium text-zinc-900">{c.name}</span>
                      <span className="text-xs text-zinc-500">Select</span>
                    </button>
                  ))}
                  {coaches.length === 0 && (
                    <p className="text-sm text-zinc-500">No coaches yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Players
                    </p>
                    <p className="text-sm text-zinc-600">
                      Add players under the selected coach.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Player name"
                      value={newPlayer.name}
                      onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })}
                    />
                    <input
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Email (optional)"
                      value={newPlayer.email}
                      onChange={(e) => setNewPlayer({ ...newPlayer, email: e.target.value })}
                    />
                  </div>
                  <button
                    className="w-full rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                    onClick={handleCreatePlayer}
                    disabled={!coachId}
                  >
                    Save player
                  </button>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {players.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-800"
                      >
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-zinc-500">{p.email || "—"}</div>
                      </div>
                    ))}
                    {players.length === 0 && (
                      <p className="text-sm text-zinc-500">No players yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Lessons
                    </p>
                    <p className="text-sm text-zinc-600">
                      Create a lesson for a player under this coach.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      value={newLesson.playerId}
                      onChange={(e) => setNewLesson({ ...newLesson, playerId: e.target.value })}
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
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      value={newLesson.date}
                      onChange={(e) => setNewLesson({ ...newLesson, date: e.target.value })}
                    />
                    <input
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Category (e.g., Hitting)"
                      value={newLesson.category}
                      onChange={(e) => setNewLesson({ ...newLesson, category: e.target.value })}
                    />
                    <textarea
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm md:col-span-2"
                      placeholder="Notes"
                      value={newLesson.notes}
                      onChange={(e) => setNewLesson({ ...newLesson, notes: e.target.value })}
                    />
                  </div>
                  <button
                    className="w-full rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                    onClick={handleCreateLesson}
                    disabled={!coachId}
                  >
                    Save lesson
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-zinc-900">Lessons</h2>
                  {loading && <p className="text-xs text-zinc-500">Loading…</p>}
                </div>
                {sortedLessons.map((lesson) => (
                  <article
                    key={lesson.id}
                    className="rounded-xl border border-zinc-200 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                          {lesson.category}
                        </p>
                        <h3 className="text-lg font-semibold text-zinc-900">
                          {players.find((p) => p.id === lesson.playerId)?.name ?? "Player"} —{" "}
                          {new Date(lesson.date).toLocaleDateString()}
                        </h3>
                      </div>
                      <a
                        href={`/lessons/${lesson.id}`}
                        className="text-sm font-medium text-blue-700 hover:underline"
                      >
                        Open
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
                          {m.type} • {m.mirroredObjectStoreUrl ? "mirrored" : "drive-only"}
                          {m.durationSeconds ? ` • ${m.durationSeconds}s` : ""}
                        </span>
                      ))}
                      {lesson.media.length === 0 && (
                        <span className="text-xs text-zinc-500">No media registered yet.</span>
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
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

