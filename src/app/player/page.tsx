"use client";

import { useCallback, useEffect, useState } from "react";

type Lesson = {
  id: string;
  date: string;
  category: string;
  notes?: string | null;
  media: {
    id: string;
    type: string;
    mirroredObjectStoreUrl?: string | null;
    googleDriveWebViewLink: string;
    durationSeconds?: number | null;
  }[];
};

export default function PlayerPage() {
  const [playerId, setPlayerId] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("playerToken") || "" : "";
    setToken(t);
  }, []);

  const fetchLessons = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/lessons?playerId=${playerId}`, {
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
  }, [playerId, token]);

  useEffect(() => {
    if (!playerId) return;
    void fetchLessons();
  }, [playerId, fetchLessons]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
        <header className="rounded-3xl bg-white/80 p-6 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.25)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Player</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-900">My lessons</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Calm, focused view of your lessons. Paste your token once, load your timeline, and tap
            through for details.
          </p>
        </header>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_auto]">
            <input
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Paste player API token"
              value={token}
              onChange={(e) => {
                const t = e.target.value;
                setToken(t);
                if (typeof window !== "undefined") {
                  localStorage.setItem("playerToken", t);
                }
              }}
            />
            <input
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Enter your player ID"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
            />
            <button
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
              onClick={fetchLessons}
              disabled={!playerId}
            >
              Load
            </button>
          </div>
        </div>

        <section className="space-y-3">
          {lessons.map((lesson) => (
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
          {lessons.length === 0 && !loading && (
            <p className="text-sm text-zinc-500">
              No lessons yet. Enter your player ID to load your lessons.
            </p>
          )}
          {loading && <p className="text-sm text-zinc-500">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>
      </div>
    </main>
  );
}

