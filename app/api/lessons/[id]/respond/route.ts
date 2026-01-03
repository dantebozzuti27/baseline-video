import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/utils/events";

const schema = z.object({
  approve: z.boolean(),
  note: z.string().max(2000).optional()
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

  const { error } = await supabase.rpc("respond_to_lesson_request", {
    p_lesson_id: params.id,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note ?? null
  });

  if (error) {
    console.error("respond_to_lesson_request failed", error);
    const msg = (error as any)?.message?.includes("conflict")
      ? "That time conflicts with another approved lesson."
      : (error as any)?.message?.includes("blocked")
        ? "That time is blocked off."
      : "Unable to update lesson request.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await logEvent(parsed.data.approve ? "lesson_approved" : "lesson_declined", "lesson", params.id, {});
  return NextResponse.json({ ok: true });
}


