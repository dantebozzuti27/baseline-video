import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/utils/events";

const patchSchema = z.object({
  pinned: z.boolean().optional(),
  isLibrary: z.boolean().optional()
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Server-side guard: only coaches can set pinned/library flags (even if RLS is misconfigured).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  const isCoach = profile?.role === "coach";
  if ((profile as any)?.is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isCoach && (typeof parsed.data.pinned === "boolean" || typeof parsed.data.isLibrary === "boolean")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: any = {};
  if (typeof parsed.data.pinned === "boolean") updates.pinned = parsed.data.pinned;
  if (typeof parsed.data.isLibrary === "boolean") updates.is_library = parsed.data.isLibrary;

  const { error } = await supabase.from("videos").update(updates).eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: error.message + " (Run supabase/migrations/0007_fast_wins_coach_features.sql)" },
      { status: 403 }
    );
  }

  await logEvent("video_update", "video", params.id, updates);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if ((profile as any)?.is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // RLS ensures the user can only see/update allowed videos.
  const { data: video, error: loadError } = await supabase
    .from("videos")
    .select("id, storage_path, deleted_at")
    .eq("id", params.id)
    .maybeSingle();

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if ((video as any).deleted_at) return NextResponse.json({ ok: true });

  // Soft delete (Trash). Storage is retained.
  const { error: trashError } = await supabase
    .from("videos")
    .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: user.id })
    .eq("id", params.id);
  if (trashError) {
    return NextResponse.json(
      {
        error:
          trashError.message +
          " (Run supabase/migrations/0009_soft_deletes_trash.sql in Supabase SQL Editor.)"
      },
      { status: 403 }
    );
  }

  await logEvent("video_trash", "video", params.id, { storage_path: (video as any).storage_path });

  return NextResponse.json({ ok: true });
}
