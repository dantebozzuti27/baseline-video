"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Select } from "@/components/ui";
import { toast } from "@/app/(app)/toast";
import { Upload, CheckCircle, Video } from "lucide-react";

/**
 * ShareUploadClient handles videos received via the PWA share_target.
 * It provides a minimal, mobile-first UI for quick uploads:
 * 1. Select category (training or game)
 * 2. Optional: select player (coach only)
 * 3. Upload and done
 */
export default function ShareUploadClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [file, setFile] = React.useState<File | null>(null);
  const [sharedUrl, setSharedUrl] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<"game" | "training">("training");
  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const [videoId, setVideoId] = React.useState<string | null>(null);
  
  const [role, setRole] = React.useState<string | null>(null);
  const [players, setPlayers] = React.useState<Array<{ user_id: string; display_name: string }>>([]);
  const [ownerUserId, setOwnerUserId] = React.useState<string | null>(null);

  // Check for shared URL in search params (for link shares)
  React.useEffect(() => {
    const url = searchParams.get("url") || searchParams.get("text");
    if (url && /^https?:\/\//i.test(url)) {
      setSharedUrl(url);
    }
  }, [searchParams]);

  // Load user role and players
  React.useEffect(() => {
    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: me } = await supabase
          .from("profiles")
          .select("role, team_id")
          .eq("user_id", user.id)
          .maybeSingle();

        setRole(me?.role ?? null);
        
        if (me?.role === "coach") {
          const { data: ps } = await supabase
            .from("profiles")
            .select("user_id, display_name")
            .eq("team_id", me.team_id)
            .eq("role", "player")
            .eq("is_active", true)
            .order("display_name", { ascending: true });
          setPlayers(ps ?? []);
        }
      } catch {
        // ignore
      }
    }
    load();
  }, []);

  // Handle file drop/selection
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
    }
  }

  // Handle drag and drop
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0].type.startsWith("video/")) {
      setFile(files[0]);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  async function getAccessToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  function generateTitle() {
    const date = new Date();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yy = String(date.getFullYear()).slice(-2);
    const catLabel = category === "game" ? "Game" : "Training";
    return `${catLabel} - ${mm}/${dd}/${yy}`;
  }

  async function handleUpload() {
    if (!file && !sharedUrl) return;
    
    setLoading(true);
    setProgress(0);

    try {
      const title = generateTitle();

      if (sharedUrl) {
        // Handle link upload
        const resp = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            category,
            source: "link",
            externalUrl: sharedUrl,
            ownerUserId: ownerUserId ?? undefined
          })
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json?.error ?? "Failed to save link");
        
        setVideoId(json.id);
        setDone(true);
        toast("Video added!");
      } else if (file) {
        // Handle file upload
        const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
        
        // Create video record
        const resp = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            category,
            source: "upload",
            fileExt: ext,
            ownerUserId: ownerUserId ?? undefined
          })
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json?.error ?? "Failed to create video");

        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Not signed in");

        // Upload to storage with progress
        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
        const url = `${baseUrl.replace(/\/$/, "")}/storage/v1/object/videos/${json.storagePath}`;

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", url, true);
          xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
          xhr.setRequestHeader("apikey", anonKey);
          xhr.setRequestHeader("x-upsert", "false");
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const pct = Math.round((evt.loaded / evt.total) * 100);
              setProgress(pct);
            }
          };

          xhr.onerror = () => reject(new Error("Upload failed"));
          xhr.onabort = () => reject(new Error("Upload cancelled"));
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error("Upload failed"));
            }
          };

          xhr.send(file);
        });

        setVideoId(json.id);
        setDone(true);
        toast("Upload complete!");
      }
    } catch (err: any) {
      console.error("Share upload failed:", err);
      // Don't show error to user per requirements
    } finally {
      setLoading(false);
    }
  }

  // Success state
  if (done && videoId) {
    return (
      <div className="stack" style={{ paddingTop: 40, alignItems: "center" }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "rgba(74, 222, 128, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16
          }}
        >
          <CheckCircle size={40} color="var(--success, #4ade80)" />
        </div>
        
        <h1 style={{ fontSize: 24, fontWeight: 900, textAlign: "center" }}>
          Done!
        </h1>
        <p className="muted" style={{ textAlign: "center", maxWidth: 280 }}>
          Your video has been uploaded and is ready for review.
        </p>
        
        <div className="row" style={{ marginTop: 24 }}>
          <Button onClick={() => router.push(`/app/videos/${videoId}`)}>
            View Video
          </Button>
          <Button variant="primary" onClick={() => router.push("/app")}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div style={{ textAlign: "center", paddingTop: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
          Quick Upload
        </h1>
        <p className="muted" style={{ fontSize: 14 }}>
          {sharedUrl ? "Add this video link" : file ? "Ready to upload" : "Share a video to Baseline"}
        </p>
      </div>

      <Card>
        {/* File/Link indicator */}
        {(file || sharedUrl) && (
          <div 
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 12,
              padding: "12px 0",
              borderBottom: "1px solid var(--border)",
              marginBottom: 16
            }}
          >
            <div 
              style={{ 
                width: 48, 
                height: 48, 
                borderRadius: 8, 
                background: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Video size={24} color="white" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file ? file.name : "Video Link"}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : sharedUrl}
              </div>
            </div>
          </div>
        )}

        {/* Drop zone if no file */}
        {!file && !sharedUrl && (
          <label
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 24px",
              border: "2px dashed var(--border)",
              borderRadius: 12,
              cursor: "pointer",
              marginBottom: 16
            }}
          >
            <Upload size={32} color="var(--muted)" />
            <div style={{ fontWeight: 600, marginTop: 12 }}>Tap to select video</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Or drop a video file here
            </div>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </label>
        )}

        {/* Category selection */}
        <Select
          label="Category"
          name="category"
          value={category}
          onChange={(v) => setCategory(v as any)}
          options={[
            { value: "training", label: "Training" },
            { value: "game", label: "Game" }
          ]}
        />

        {/* Player selection (coach only) */}
        {role === "coach" && players.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <label className="label">For player (optional)</label>
            <select
              className="select"
              value={ownerUserId ?? ""}
              onChange={(e) => setOwnerUserId(e.target.value || null)}
              disabled={loading}
            >
              <option value="">Myself</option>
              {players.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Progress bar */}
        {loading && (
          <div style={{ marginTop: 16 }}>
            <div className="bvProgressBar">
              <div
                className="bvProgressBarFill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 8, textAlign: "center" }}>
              {sharedUrl ? "Saving..." : `Uploading ${progress}%`}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
          <Button onClick={() => router.back()} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            disabled={loading || (!file && !sharedUrl)}
          >
            {loading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

