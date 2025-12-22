import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  token: z.string().min(8),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80)
});

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user?.id) return data.user.id;
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: Request) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("join_team_with_invite_token", {
    p_token: parsed.data.token,
    p_user_id: userId,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName
  });

  if (error) {
    return NextResponse.json(
      { error: error.message + " (Run supabase/migrations/0008_sprint2_invites_events_activity_roster.sql)" },
      { status: 500 }
    );
  }

  return NextResponse.json({ teamId: data });
}
