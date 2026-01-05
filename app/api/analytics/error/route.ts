import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  error_type: z.enum(["frontend", "api", "database"]),
  message: z.string().min(1).max(2000),
  stack: z.string().max(10000).optional(),
  endpoint: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Use admin client to insert
    const admin = createSupabaseAdminClient();
    await admin.from("error_logs").insert({
      error_type: parsed.data.error_type,
      message: parsed.data.message,
      stack: parsed.data.stack ?? null,
      user_id: user?.id ?? null,
      endpoint: parsed.data.endpoint ?? null,
      metadata: parsed.data.metadata ?? {}
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error log error:", e);
    return NextResponse.json({ ok: true }); // Still return ok
  }
}

