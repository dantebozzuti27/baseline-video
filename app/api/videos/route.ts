import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.enum(["game", "training"]),
  fileExt: z.string().min(1).max(12)
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
    .select("team_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError || !profile?.team_id) return NextResponse.json({ error: "Profile missing" }, { status: 400 });

  const id = crypto.randomUUID();
  const safeExt = parsed.data.fileExt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const storagePath = `${profile.team_id}/${user.id}/${id}.${safeExt}`;

  const { error: insertError } = await supabase.from("videos").insert({
    id,
    team_id: profile.team_id,
    uploader_user_id: user.id,
    owner_user_id: user.id,
    category: parsed.data.category,
    title: parsed.data.title,
    storage_path: storagePath
  });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ id, storagePath });
}


