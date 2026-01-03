import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  cues: z.array(z.string().trim()).optional()
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

  const { data, error } = await supabase.rpc("create_program_focus", {
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_cues_json: (parsed.data.cues ?? []).map((s) => s.trim()).filter(Boolean)
  });

  if (error) {
    console.error("create_program_focus failed", error);
    return NextResponse.json({ error: "Unable to create focus." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}


