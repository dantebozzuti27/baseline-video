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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-white px-4 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Player
        </p>
        <h1 className="text-2xl font-bold">My lessons</h1>
        <p className="text-sm text-zinc-600">
          Tap a lesson to view video and notes. Upload new swings directly to
          the assigned lesson.
        </p>
      </header>

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 rounded-xl border px-3 py-2 text-sm"
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
          className="flex-1 rounded-xl border px-3 py-2 text-sm"
          placeholder="Enter your player ID"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
        />
        <button
          className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
          onClick={fetchLessons}
          disabled={!playerId}
        >
          Load
        </button>
      </div>

      <section className="space-y-3">
        {lessons.map((lesson) => (
          <a
            key={lesson.id}
            href={`/lessons/${lesson.id}`}
            className="block rounded-2xl border border-zinc-200 p-4 shadow-sm transition hover:border-blue-500"
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
                {lesson.media.some((m) => m.mirroredObjectStoreUrl)
                  ? "Mirrored"
                  : "Drive only"}
              </p>
            </div>
            <p className="mt-2 text-sm text-zinc-700">
              {lesson.notes || "No coach notes yet."}
            </p>
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
    </main>
  );
}

