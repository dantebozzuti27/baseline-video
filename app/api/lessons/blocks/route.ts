import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createSchema = z.object({
  startAt: z.string().min(1),
  minutes: z.number().int().min(15).max(24 * 60),
  timezone: z.string().min(1).max(64).optional(),
  note: z.string().max(2000).optional()
});

const deleteSchema = z.object({
  id: z.string().uuid()
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

  const startAt = new Date(parsed.data.startAt);
  if (!Number.isFinite(startAt.getTime())) return NextResponse.json({ error: "Invalid start time." }, { status: 400 });

  const { data, error } = await supabase.rpc("create_coach_time_block", {
    p_start_at: startAt.toISOString(),
    p_minutes: parsed.data.minutes,
    p_timezone: parsed.data.timezone ?? "UTC",
    p_note: parsed.data.note ?? null
  });

  if (error) {
    console.error("create_coach_time_block failed", error);
    const msg = (error as any)?.message?.includes("conflict")
      ? "You already have an approved lesson during that time."
      : "Unable to block time.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}

export async function DELETE(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error } = await supabase.rpc("delete_coach_time_block", {
    p_block_id: parsed.data.id
  });

  if (error) {
    console.error("delete_coach_time_block failed", error);
    return NextResponse.json({ error: "Unable to remove blocked time." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


