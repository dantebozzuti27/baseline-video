import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  weeksCount: z.number().int().min(1).max(52),
  cycleDays: z.number().int().min(1).max(21).optional()
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

  const { data, error } = await supabase.rpc("create_program_template", {
    p_title: parsed.data.title ?? null,
    p_weeks_count: parsed.data.weeksCount,
    p_cycle_days: parsed.data.cycleDays ?? null
  });

  if (error) {
    console.error("create_program_template failed", error);
    return NextResponse.json({ error: "Unable to create program." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}


