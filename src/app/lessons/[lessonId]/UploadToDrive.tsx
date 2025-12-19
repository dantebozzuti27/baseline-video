"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type UploadState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "uploading"; progress: number }
  | { status: "registering" }
  | { status: "done" }
  | { status: "error"; message: string };

export function UploadToDrive(props: { lessonId: string }) {
  const { lessonId } = props;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [state, setState] = useState<UploadState>({ status: "idle" });

  async function onPickFile(f: File | null) {
    setFile(null);
    setDurationSeconds(null);
    if (!f) return;

    // Basic client-side duration check (<= 120s) for video uploads.
    if (f.type.startsWith("video/")) {
      setState({ status: "checking" });
      const url = URL.createObjectURL(f);
      try {
        const duration = await new Promise<number>((resolve, reject) => {
          const video = document.createElement("video");
          video.preload = "metadata";
          video.onloadedmetadata = () => resolve(video.duration);
          video.onerror = () => reject(new Error("Could not read video metadata"));
          video.src = url;
        });
        const seconds = Math.ceil(duration);
        if (!Number.isFinite(seconds)) {
          throw new Error("Could not read video duration");
        }
        if (seconds > 120) {
          setState({
            status: "error",
            message: `Video is ${seconds}s. Max allowed is 120s (2 minutes).`,
          });
          return;
        }
        setDurationSeconds(seconds);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    setFile(f);
    setState({ status: "idle" });
  }

  async function upload() {
    if (!file) return;
    setState({ status: "uploading", progress: 0 });

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const accessToken = session?.provider_token;
    if (!accessToken) {
      setState({
        status: "error",
        message:
          "No Google access token found. You must sign in with Google to upload to Drive (then retry).",
      });
      return;
    }

    try {
      // 1) Initiate resumable session
      const initRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": file.type || "application/octet-stream",
            "X-Upload-Content-Length": String(file.size),
          },
          body: JSON.stringify({ name: file.name }),
        },
      );

      if (!initRes.ok) {
        const text = await initRes.text();
        throw new Error(
          `Drive init failed (${initRes.status}). ${text || "Check your Google scopes in Supabase (drive.file)."}`,
        );
      }

      const uploadUrl = initRes.headers.get("Location");
      if (!uploadUrl) {
        throw new Error("Drive did not return an upload URL (missing Location header).");
      }

      // 2) Upload bytes with progress
      const driveFile = await new Promise<{ id: string; webViewLink?: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader(
            "Content-Type",
            file.type || "application/octet-stream",
          );

          xhr.upload.onprogress = (evt) => {
            if (!evt.lengthComputable) return;
            const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
            setState({ status: "uploading", progress: pct });
          };

          xhr.onerror = () => reject(new Error("Upload failed (network error)."));
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const parsed = JSON.parse(xhr.responseText || "{}");
                resolve(parsed);
              } catch {
                reject(new Error("Upload succeeded but response was not valid JSON."));
              }
            } else {
              reject(
                new Error(
                  `Drive upload failed (${xhr.status}). ${xhr.responseText || ""}`,
                ),
              );
            }
          };

          xhr.send(file);
        },
      );

      const googleDriveFileId = driveFile.id;
      const googleDriveWebViewLink = driveFile.webViewLink;
      if (!googleDriveFileId || !googleDriveWebViewLink) {
        throw new Error(
          "Drive upload succeeded but missing id/webViewLink. Ensure Drive API returned fields=id,webViewLink.",
        );
      }

      // 3) Register media to lesson (server will enqueue mirror job)
      setState({ status: "registering" });
      const regRes = await fetch(`/api/lessons/${lessonId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: file.type.startsWith("image/") ? "image" : "video",
          googleDriveFileId,
          googleDriveWebViewLink,
          durationSeconds: durationSeconds ?? undefined,
        }),
      });

      if (!regRes.ok) {
        const text = await regRes.text();
        throw new Error(`Failed to register media (${regRes.status}). ${text}`);
      }

      setState({ status: "done" });
      setFile(null);
      setDurationSeconds(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Upload failed",
      });
    }
  }

  const busy = state.status === "checking" || state.status === "uploading" || state.status === "registering";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-sm font-semibold">Upload video to Google Drive</h2>
      <p className="mt-2 text-xs text-white/60">
        Uploads go directly to Drive from your browser (faster + avoids Vercel limits). Max 2 minutes.
      </p>

      <div className="mt-4 grid gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*"
          disabled={busy}
          onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white"
        />

        {file ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="mt-1 text-xs text-white/60">
                {durationSeconds ? `${durationSeconds}s` : file.type} • {(file.size / (1024 * 1024)).toFixed(1)}MB
              </p>
            </div>
            <button
              type="button"
              onClick={() => void upload()}
              disabled={busy}
              className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
            >
              Upload
            </button>
          </div>
        ) : null}

        {state.status === "uploading" ? (
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs text-white/70">Uploading… {state.progress}%</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-white"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {state.status === "registering" ? (
          <p className="text-xs text-white/70">Registering media…</p>
        ) : null}

        {state.status === "done" ? (
          <p className="text-xs text-white/70">Uploaded and attached to lesson.</p>
        ) : null}

        {state.status === "error" ? (
          <p className="text-xs text-red-300">{state.message}</p>
        ) : null}

        <p className="text-xs text-white/50">
          If you see a Drive scope error, go to Supabase → Auth → Providers → Google and add
          the scope <span className="font-semibold">https://www.googleapis.com/auth/drive.file</span>, then sign out/in.
        </p>
      </div>
    </div>
  );
}


