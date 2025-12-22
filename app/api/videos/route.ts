import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.enum(["game", "training"]),
  fileExt: z.string().min(1).max(12),
  ownerUserId: z.string().uuid().optional(),
  pinned: z.boolean().optional(),
  isLibrary: z.boolean().optional()
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("team_id, role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError || !profile?.team_id) return NextResponse.json({ error: "Profile missing" }, { status: 400 });
  if ((profile as any).is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = crypto.randomUUID();
  const safeExt = parsed.data.fileExt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const storagePath = `${profile.team_id}/${user.id}/${id}.${safeExt}`;

  const ownerUserId = parsed.data.ownerUserId ?? user.id;
  const isCoach = profile.role === "coach";

  // Only coaches can upload for another player and only coaches can set pinned/library flags.
  const pinned = isCoach ? Boolean(parsed.data.pinned) : false;
  const isLibrary = isCoach ? Boolean(parsed.data.isLibrary) : false;

  if (parsed.data.ownerUserId && !isCoach) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // If coach uploads for a player, ensure the player is on the same team and active.
  if (isCoach && ownerUserId !== user.id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("user_id, team_id, role, is_active")
      .eq("user_id", ownerUserId)
      .maybeSingle();
    if (!owner || owner.team_id !== profile.team_id || owner.role !== "player" || owner.is_active === false) {
      return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
    }
  }

  const { error: insertError } = await supabase.from("videos").insert({
    id,
    team_id: profile.team_id,
    uploader_user_id: user.id,
    owner_user_id: ownerUserId,
    category: parsed.data.category,
    title: parsed.data.title,
    storage_path: storagePath,
    pinned,
    is_library: isLibrary
  });

  if (insertError) {
    return NextResponse.json(
      {
        error:
          insertError.message +
          " (If this mentions RLS, run supabase/migrations/0007_fast_wins_coach_features.sql in Supabase SQL Editor.)"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ id, storagePath });
}
