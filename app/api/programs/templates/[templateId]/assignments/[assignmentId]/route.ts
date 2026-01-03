import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(_req: Request, { params }: { params: { templateId: string; assignmentId: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Template id is validated in RPC by ownership; included for route shape consistency.
  const { error } = await supabase.rpc("delete_program_template_day_assignment", {
    p_assignment_id: params.assignmentId
  });

  if (error) {
    console.error("delete_program_template_day_assignment failed", error);
    return NextResponse.json({ error: "Unable to delete assignment." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


