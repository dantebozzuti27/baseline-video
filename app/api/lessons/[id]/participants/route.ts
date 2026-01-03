import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  playerUserId: z.string().uuid(),
  present: z.boolean()
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error } = await supabase.rpc("coach_set_lesson_participant", {
    p_lesson_id: params.id,
    p_player_user_id: parsed.data.playerUserId,
    p_present: parsed.data.present
  });

  if (error) {
    console.error("coach_set_lesson_participant failed", error);
    return NextResponse.json({ error: "Unable to update participants." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


