import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  workStartMin: z.number().int().min(0).max(1440),
  workEndMin: z.number().int().min(0).max(1440),
  slotMin: z.number().int()
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

  if (parsed.data.workEndMin <= parsed.data.workStartMin) {
    return NextResponse.json({ error: "End must be after start." }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_my_coach_schedule_settings", {
    p_work_start_min: parsed.data.workStartMin,
    p_work_end_min: parsed.data.workEndMin,
    p_slot_min: parsed.data.slotMin
  });

  if (error) {
    console.error("set_my_coach_schedule_settings failed", error);
    return NextResponse.json({ error: "Unable to save working hours." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


