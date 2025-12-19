"use client";

import { useEffect, useState } from "react";

import { AddMediaForm } from "@/components/media-form";
import { signIn, signOut, useSession } from "next-auth/react";

type Props = {
  params: { id: string };
};

type Media = {
  id: string;
  type: string;
  mirroredObjectStoreUrl?: string | null;
  durationSeconds?: number | null;
  googleDriveWebViewLink: string;
};

type LessonResponse = {
  id: string;
  player: { name: string };
  coach: { id: string; name: string };
  category: string;
  date: string;
  notes?: string | null;
  media: Media[];
};

export default function LessonDetailPage({ params }: Props) {
  const session = useSession();
  const [lesson, setLesson] = useState<LessonResponse | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("coachToken") || "" : "";
    setToken(t);
  }, []);

  useEffect(() => {
    async function fetchLesson() {
      setError(null);
      setLoading(true);
      try {
        const res = await fetch(`/api/lessons/${params.id}`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load lesson");
        }
        const data = await res.json();
        setLesson(data.lesson as LessonResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lesson");
      } finally {
        setLoading(false);
      }
    }
    if (token) {
      void fetchLesson();
    }
  }, [params.id, token]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Lesson {params.id}
        </p>
        <div className="flex items-center gap-2">
          {session.status !== "authenticated" ? (
            <button
              className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => signIn("google")}
            >
              Sign in with Google
            </button>
          ) : (
            <>
              <span className="text-sm text-zinc-700">
                Signed in as {session.data?.user?.email ?? "coach"}
              </span>
              <button
                className="rounded-md bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800"
                onClick={() => signOut()}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {lesson && (
        <>
          <section className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">
              {lesson.player.name} — {lesson.category}
            </h1>
            <p className="text-sm text-zinc-600">
              {new Date(lesson.date).toLocaleDateString()} · Coach {lesson.coach.name}
            </p>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Coach notes</h2>
            <p className="mt-2 text-sm text-zinc-700">
              {lesson.notes || "No notes yet."}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Media</h2>
            {lesson.media.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                      {item.type}
                    </span>
                    <p className="text-sm text-zinc-700">
                      {item.durationSeconds ? `${item.durationSeconds}s` : "—"}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-green-700">
                    {item.mirroredObjectStoreUrl ? "Mirrored (CDN)" : "Drive fallback"}
                  </p>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Playback prefers mirrored URL; falls back to Drive when missing.
                </p>
                <div className="mt-3 space-y-2">
                  {item.mirroredObjectStoreUrl ? (
                    <video
                      controls
                      className="w-full rounded-lg border border-zinc-200"
                      src={item.mirroredObjectStoreUrl}
                    />
                  ) : (
                    <a
                      className="text-sm font-medium text-blue-700 hover:underline"
                      href={item.googleDriveWebViewLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Drive
                    </a>
                  )}
                </div>
              </div>
            ))}
            {lesson.media.length === 0 && (
              <p className="text-sm text-zinc-500">No media registered yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5">
            <h2 className="text-lg font-semibold">Register media</h2>
            <p className="text-sm text-zinc-600">
              Paste the Drive file ID and web view link after uploading to Drive. When
              a CDN URL is available, include it to prefer mirrored playback.
            </p>
            <div className="mt-4">
              <AddMediaForm lessonId={lesson.id} />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

