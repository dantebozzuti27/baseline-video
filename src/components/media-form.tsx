"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  lessonId: string;
};

export function AddMediaForm({ lessonId }: Props) {
  const router = useRouter();
  const [token, setToken] = useState("");

  // Load token from localStorage on client
  useEffect(() => {
    const t = localStorage.getItem("coachToken") || "";
    setToken(t);
  }, []);
  const [type, setType] = useState<"video" | "image">("video");
  const [googleDriveFileId, setGoogleDriveFileId] = useState("");
  const [googleDriveWebViewLink, setGoogleDriveWebViewLink] = useState("");
  const [mirroredObjectStoreUrl, setMirroredObjectStoreUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/media`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: token ? `Bearer ${token}` : undefined,
        },
        body: JSON.stringify({
          type,
          googleDriveFileId,
          googleDriveWebViewLink,
          mirroredObjectStoreUrl: mirroredObjectStoreUrl || null,
          durationSeconds:
            durationSeconds === "" ? undefined : Number(durationSeconds),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to register media");
      }
      setGoogleDriveFileId("");
      setGoogleDriveWebViewLink("");
      setMirroredObjectStoreUrl("");
      setDurationSeconds("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register media");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <label className="text-sm font-medium text-zinc-700">Type</label>
        <select
            className="rounded-md border px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as "video" | "image")}
          >
            <option value="video">video</option>
            <option value="image">image</option>
          </select>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Google Drive file ID
          </label>
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="drive file id"
            value={googleDriveFileId}
            onChange={(e) => setGoogleDriveFileId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Drive web view link
          </label>
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="https://drive.google.com/file/d/..."
            value={googleDriveWebViewLink}
            onChange={(e) => setGoogleDriveWebViewLink(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Mirrored CDN URL (optional)
          </label>
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="https://cdn.example.com/path"
            value={mirroredObjectStoreUrl}
            onChange={(e) => setMirroredObjectStoreUrl(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Duration seconds (optional, max 120)
          </label>
          <input
            className="rounded-md border px-3 py-2 text-sm"
            type="number"
            min={1}
            max={120}
            value={durationSeconds}
            onChange={(e) => {
              const v = e.target.value;
              setDurationSeconds(v === "" ? "" : Number(v));
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={handleSubmit}
          disabled={
            submitting || !googleDriveFileId || !googleDriveWebViewLink || !token
          }
        >
          {submitting ? "Saving..." : "Save media"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!token && (
          <p className="text-xs text-zinc-500">
            Paste a coach token on the lesson page to register media.
          </p>
        )}
      </div>
    </div>
  );
}

