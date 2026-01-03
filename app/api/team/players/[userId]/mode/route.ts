import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/utils/events";

const schema = z.object({
  mode: z.enum(["in_person", "hybrid", "remote"])
});

export async function PATCH(req: Request, { params }: { params: { userId: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Enforced server-side in the RPC: coach-only + same-team
  const { error } = await supabase.rpc("set_player_mode", {
    p_user_id: params.userId,
    p_mode: parsed.data.mode
  });

  if (error) {
    console.error("set_player_mode failed", error);
    return NextResponse.json({ error: "Unable to update player category." }, { status: 500 });
  }

  await logEvent("player_mode_updated", "profile", params.userId, { mode: parsed.data.mode });
  return NextResponse.json({ ok: true });
}


