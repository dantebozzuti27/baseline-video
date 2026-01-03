import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  templateId: z.string().min(1),
  playerUserId: z.string().min(1),
  startAt: z.string().datetime().optional()
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data, error } = await supabase.rpc("enroll_player_in_program", {
    p_template_id: parsed.data.templateId,
    p_player_user_id: parsed.data.playerUserId,
    p_start_at: parsed.data.startAt ? new Date(parsed.data.startAt).toISOString() : null
  });

  if (error) {
    console.error("enroll_player_in_program failed", error);
    return NextResponse.json({ error: "Unable to enroll player." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}


