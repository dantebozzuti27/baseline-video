import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().trim().min(1).max(140),
  category: z.enum(["hitting", "throwing", "fielding", "other"]).optional(),
  goal: z.string().trim().max(2000).optional(),
  equipment: z.array(z.string().trim()).optional(),
  cues: z.array(z.string().trim()).optional(),
  mistakes: z.array(z.string().trim()).optional()
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

  const { data, error } = await supabase.rpc("create_program_drill", {
    p_title: parsed.data.title,
    p_category: parsed.data.category ?? "other",
    p_goal: parsed.data.goal ?? null,
    p_equipment_json: (parsed.data.equipment ?? []).map((s) => s.trim()).filter(Boolean),
    p_cues_json: (parsed.data.cues ?? []).map((s) => s.trim()).filter(Boolean),
    p_common_mistakes_json: (parsed.data.mistakes ?? []).map((s) => s.trim()).filter(Boolean)
  });

  if (error) {
    console.error("create_program_drill failed", error);
    return NextResponse.json({ error: "Unable to create drill." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}


