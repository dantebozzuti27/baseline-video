"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";

export const dynamic = "force-dynamic";

type Lesson = {
  id: string;
  date: string;
  category: string;
  notes?: string | null;
  coachId?: string;
  media: {
    id: string;
    type: string;
    mirroredObjectStoreUrl?: string | null;
    googleDriveWebViewLink: string;
    durationSeconds?: number | null;
  }[];
};

type Player = {
  id: string;
  name: string;
  email?: string | null;
};

export default function PlayerPage() {
  const { status } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayers = useCallback(async () => {
    if (status !== "authenticated") return;
    setError(null);
    try {
      const res = await fetch("/api/players", { cache: "no-store" });
      const data = await res.json();
      setPlayers(data.players ?? []);
    } catch {
      setError("Failed to load players");
    }
  }, [status]);

  useEffect(() => {
    void fetchPlayers();
  }, [fetchPlayers]);

  const fetchLessons = useCallback(async () => {
    if (!selectedPlayer) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/lessons?playerId=${selectedPlayer}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setLessons(data.lessons ?? []);
    } catch {
      setError("Failed to load lessons");
    } finally {
      setLoading(false);
    }
  }, [selectedPlayer]);

  useEffect(() => {
    void fetchLessons();
  }, [fetchLessons]);

  const sortedLessons = useMemo(
    () =>
      [...lessons].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [lessons],
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
        <header className="rounded-3xl bg-white/80 p-6 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.25)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Player</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-900">My lessons</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Sign in, pick your name, and view your lessons with mirrored/Drive playback fallback.
          </p>
        </header>

        {status !== "authenticated" ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm text-center">
            <p className="text-sm text-zinc-700">Sign in to view your lessons.</p>
            <button
              className="mt-3 inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => signIn("google", { callbackUrl: "/player" })}
            >
              Continue with Google
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <select
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  value={selectedPlayer}
                  onChange={(e) => setSelectedPlayer(e.target.value)}
                >
                  <option value="">Select your name</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                  onClick={fetchLessons}
                  disabled={!selectedPlayer}
                >
                  Load lessons
                </button>
              </div>
            </div>

            <section className="space-y-3">
              {sortedLessons.map((lesson) => (
                <a
                  key={lesson.id}
                  href={`/lessons/${lesson.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                        {lesson.category}
                      </p>
                      <h2 className="text-lg font-semibold">
                        {new Date(lesson.date).toLocaleDateString()}
                      </h2>
                    </div>
                    <p className="text-xs font-medium text-green-700">
                      {lesson.media.some((m) => m.mirroredObjectStoreUrl) ? "Mirrored" : "Drive only"}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">{lesson.notes || "No coach notes yet."}</p>
                </a>
              ))}
              {sortedLessons.length === 0 && !loading && (
                <p className="text-sm text-zinc-500">No lessons yet. Select your name to load.</p>
              )}
              {loading && <p className="text-sm text-zinc-500">Loading…</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

