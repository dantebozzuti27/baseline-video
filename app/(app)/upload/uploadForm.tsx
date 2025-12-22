"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input, Select } from "@/components/ui";

const schema = z.object({
  title: z.string().max(120).optional(),
  category: z.enum(["game", "training"])
});

type UploadItem = {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  videoId?: string;
};

function formatDateForTitle(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

export default function UploadForm() {
  const router = useRouter();

  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<"game" | "training">("training");
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [role, setRole] = React.useState<string | null>(null);
  const [players, setPlayers] = React.useState<Array<{ user_id: string; display_name: string }>>([]);
  const [ownerUserId, setOwnerUserId] = React.useState<string | null>(null);

  const [quickMode, setQuickMode] = React.useState(true);
  const [pinned, setPinned] = React.useState(false);
  const [isLibrary, setIsLibrary] = React.useState(false);

  React.useEffect(() => {
    // Strong defaults: remember category + quick mode
    try {
      const lastCat = window.localStorage.getItem("bv:lastCategory");
      if (lastCat === "game" || lastCat === "training") setCategory(lastCat);
      const qm = window.localStorage.getItem("bv:quickMode");
      if (qm === "0" || qm === "1") setQuickMode(qm === "1");
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem("bv:lastCategory", category);
      window.localStorage.setItem("bv:quickMode", quickMode ? "1" : "0");
    } catch {
      // ignore
    }
  }, [category, quickMode]);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: me } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
        if (cancelled) return;

        setRole(me?.role ?? null);
        if (me?.role === "coach") {
          const { data: ps } = await supabase
            .from("profiles")
            .select("user_id, display_name, role")
            .eq("role", "player")
            .order("display_name", { ascending: true });
          if (cancelled) return;
          const list = (ps ?? []).map((p: any) => ({ user_id: p.user_id, display_name: p.display_name }));
          setPlayers(list);
          // Default owner to first player? No: default to coach's own uploads.
          setOwnerUserId(null);
        }
      } catch {
        // ignore
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function suggestedTitle() {
    const date = formatDateForTitle();
    const catLabel = category === "game" ? "Game" : "Training";
    const ownerLabel = ownerUserId
      ? players.find((p) => p.user_id === ownerUserId)?.display_name ?? "Player"
      : role === "coach"
        ? "Coach"
        : "Me";
    return `${ownerLabel} - ${catLabel} - ${date}`;
  }

  function onPickFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files);
    setItems(picked.map((f) => ({ file: f, status: "queued" })));
  }

  async function uploadOne(item: UploadItem, idx: number) {
    const file = item.file;
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();

    const finalTitle = (quickMode ? (title.trim() || suggestedTitle()) : title.trim()) || suggestedTitle();

    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status: "uploading", error: undefined } : it)));

    const resp = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: finalTitle,
        category,
        fileExt: ext,
        ownerUserId: ownerUserId ?? undefined,
        pinned: pinned || undefined,
        isLibrary: isLibrary || undefined
      })
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to create video record.");

    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage.from("videos").upload((json as any).storagePath, file, {
      upsert: false,
      contentType: file.type || "video/mp4"
    });
    if (uploadError) throw uploadError;

    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status: "done", videoId: (json as any).id } : it)));
    return (json as any).id as string;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError("Choose at least one video file.");
      return;
    }

    const parsed = schema.safeParse({ title, category });
    if (!parsed.success) {
      setError("Select a category and keep the title under 120 characters.");
      return;
    }

    setLoading(true);
    try {
      const doneIds: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.status === "done") continue;
        try {
          const id = await uploadOne(it, i);
          doneIds.push(id);
        } catch (err: any) {
          setItems((prev) => prev.map((x, j) => (j === i ? { ...x, status: "error", error: err?.message } : x)));
        }
      }

      const first = doneIds[0] ?? items.find((it) => it.status === "done")?.videoId;
      if (first && items.length === 1) {
        router.replace(`/app/videos/${first}`);
      } else {
        router.replace("/app");
      }
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  const uploadingIndex = items.findIndex((i) => i.status === "uploading");
  const uploadedCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="stack">
      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Upload</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Quick, simple, and practice-friendly.
        </div>
      </div>

      <Card>
        <form className="stack" onSubmit={onSubmit}>
          <div className="row" style={{ alignItems: "center" }}>
            <label className="pill" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={quickMode}
                onChange={(e) => setQuickMode(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Quick mode
            </label>
            <div className="muted" style={{ fontSize: 12 }}>
              {quickMode ? "Title optional; we’ll auto-name it." : "Title required."}
            </div>
          </div>

          {!quickMode ? (
            <Input label="Title" name="title" value={title} onChange={setTitle} placeholder={suggestedTitle()} />
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <div className="label">Title (optional)</div>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestedTitle()} />
              <div className="muted" style={{ fontSize: 12 }}>
                Default: <b>{suggestedTitle()}</b>
              </div>
            </div>
          )}

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

          {role === "coach" ? (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="label">Assign to player (optional)</div>
                  <select
                    className="select"
                    value={ownerUserId ?? ""}
                    onChange={(e) => setOwnerUserId(e.target.value || null)}
                  >
                    <option value="">Me (coach)</option>
                    {players.map((p) => (
                      <option key={p.user_id} value={p.user_id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="row" style={{ alignItems: "center" }}>
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ marginRight: 8 }} />
                  Pin
                </label>
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isLibrary}
                    onChange={(e) => setIsLibrary(e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Coach library
                </label>
                <div className="muted" style={{ fontSize: 12 }}>
                  Library videos are visible to your whole team.
                </div>
              </div>
            </div>
          ) : null}

          <div className="stack" style={{ gap: 6 }}>
            <div className="label">Video files</div>
            <input className="input" type="file" accept="video/*" multiple onChange={(e) => onPickFiles(e.target.files)} />
            <div className="muted" style={{ fontSize: 12 }}>
              {items.length > 1 ? "Batch upload enabled." : "You can select multiple videos."}
            </div>
          </div>

          {items.length > 0 ? (
            <div className="card">
              <div style={{ fontWeight: 900 }}>Queue</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {loading ? `Uploading ${uploadedCount}/${items.length}…` : `${items.length} file(s) selected.`}
              </div>
              <div className="stack" style={{ marginTop: 10 }}>
                {items.map((it, i) => (
                  <div key={i} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{it.file.name}</div>
                    <div className="row" style={{ alignItems: "center" }}>
                      <div className="pill">
                        {it.status === "queued"
                          ? "Queued"
                          : it.status === "uploading"
                            ? "Uploading"
                            : it.status === "done"
                              ? "Done"
                              : "Error"}
                      </div>
                      {it.status === "error" ? (
                        <div className="muted" style={{ fontSize: 12, maxWidth: 260 }}>
                          {it.error}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}

          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? (uploadingIndex >= 0 ? "Uploading…" : "Working…") : items.length > 1 ? "Upload all" : "Upload"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
