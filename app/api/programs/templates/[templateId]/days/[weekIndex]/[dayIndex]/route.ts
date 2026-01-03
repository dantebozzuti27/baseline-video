import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  focusId: z.string().nullable().optional(),
  note: z.string().trim().max(2000).optional()
});

export async function PATCH(req: Request, { params }: { params: { templateId: string; weekIndex: string; dayIndex: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekIndex = Number(params.weekIndex);
  const dayIndex = Number(params.dayIndex);
  if (!Number.isFinite(weekIndex) || !Number.isFinite(dayIndex)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Convert empty string to null for focus_id
  const focusId = parsed.data.focusId?.trim() || null;

  const { error } = await supabase.rpc("set_program_template_day", {
    p_template_id: params.templateId,
    p_week_index: weekIndex,
    p_day_index: dayIndex,
    p_focus_id: focusId,
    p_note: parsed.data.note ?? null
  });

  if (error) {
    console.error("set_program_template_day failed", error);
    return NextResponse.json({ error: "Unable to update day plan." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


