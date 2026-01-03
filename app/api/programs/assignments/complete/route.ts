import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  assignmentId: z.string().min(1)
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

  const { error } = await supabase.rpc("complete_program_assignment", {
    p_assignment_id: parsed.data.assignmentId
  });

  if (error) {
    console.error("complete_program_assignment failed", error);
    return NextResponse.json({ error: "Unable to mark complete." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


