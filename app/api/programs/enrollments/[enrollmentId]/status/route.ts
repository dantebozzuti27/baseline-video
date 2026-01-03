import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  status: z.enum(["active", "paused", "completed"])
});

export async function PATCH(req: Request, { params }: { params: { enrollmentId: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error } = await supabase.rpc("set_enrollment_status", {
    p_enrollment_id: params.enrollmentId,
    p_status: parsed.data.status
  });

  if (error) {
    console.error("set_enrollment_status failed", error);
    return NextResponse.json({ error: "Unable to update program." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


