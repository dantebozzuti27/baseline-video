import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  accessCode: z.string().min(4).max(32)
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("preview_team_from_access_code", {
    p_access_code: parsed.data.accessCode
  });

  if (error) {
    return NextResponse.json(
      { error: error.message + " (Run supabase/migrations/0007_fast_wins_coach_features.sql)" },
      { status: 500 }
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ ok: false }, { status: 200 });

  return NextResponse.json({ ok: true, teamName: row.team_name, coachName: row.coach_name });
}
