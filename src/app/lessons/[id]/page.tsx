"use client";

import { useEffect, useState } from "react";

import { AddMediaForm } from "@/components/media-form";
import { signIn, signOut, useSession } from "next-auth/react";

export const dynamic = "force-dynamic";

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
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-3 rounded-3xl bg-white/80 p-6 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.25)] backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Lesson {params.id}
            </p>
            <p className="text-sm text-zinc-600">
              Authenticate with Google (Drive) to register media, or browse existing media below.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {session.status !== "authenticated" ? (
              <button
                className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg"
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
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:-translate-y-0.5 hover:shadow-md"
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
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-zinc-900">
                    {lesson.player.name} — {lesson.category}
                  </h1>
                  <p className="text-sm text-zinc-600">
                    {new Date(lesson.date).toLocaleDateString()} · Coach {lesson.coach.name}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                {lesson.notes || "No notes yet."}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-zinc-900">Media</h2>
              {lesson.media.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
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

            <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Register media</h2>
              <p className="text-sm text-zinc-600">
                Paste the Drive file ID and web view link after uploading to Drive. When a CDN URL is
                available, include it to prefer mirrored playback.
              </p>
              <div className="mt-4">
                <AddMediaForm lessonId={lesson.id} />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

