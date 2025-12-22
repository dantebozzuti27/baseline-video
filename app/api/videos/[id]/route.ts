import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS ensures the user can only see/delete allowed videos.
  const { data: video, error: loadError } = await supabase
    .from("videos")
    .select("id, storage_path")
    .eq("id", params.id)
    .maybeSingle();

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error: deleteError } = await supabase.from("videos").delete().eq("id", params.id);
  if (deleteError) {
    return NextResponse.json(
      {
        error:
          deleteError.message +
          " (If this mentions RLS/permission denied, run supabase/migrations/0006_hotfix_names_and_deletes.sql in Supabase SQL Editor.)"
      },
      { status: 403 }
    );
  }

  // Best-effort storage cleanup (server-only)
  try {
    const admin = createSupabaseAdminClient();
    await admin.storage.from("videos").remove([video.storage_path]);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}
