"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input, Select } from "@/components/ui";

const schema = z.object({
  title: z.string().min(1).max(120),
  category: z.enum(["game", "training"])
});

export default function UploadForm() {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<"game" | "training">("training");
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Choose a video file.");
      return;
    }

    const parsed = schema.safeParse({ title, category });
    if (!parsed.success) {
      setError("Add a title and select a category.");
      return;
    }

    setLoading(true);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();

      const resp = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: parsed.data.title, category: parsed.data.category, fileExt: ext })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Unable to create video record.");

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage.from("videos").upload(json.storagePath, file, {
        upsert: false,
        contentType: file.type || "video/mp4"
      });
      if (uploadError) throw uploadError;

      router.replace(`/app/videos/${json.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Upload a video</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Keep it simple: Game or Training.
        </div>
      </div>

      <Card>
        <form className="stack" onSubmit={onSubmit}>
          <Input label="Title" name="title" value={title} onChange={setTitle} placeholder="Front toss — 12/22" />
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

          <div className="stack" style={{ gap: 6 }}>
            <div className="label">Video file</div>
            <input
              className="input"
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="muted" style={{ fontSize: 12 }}>
              Tip: keep uploads short for faster sharing.
            </div>
          </div>

          {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Uploading…" : "Upload"}
          </Button>
        </form>
      </Card>
    </div>
  );
}


