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
  
  // First, validate the invite token to find the team
  const { data: inviteData, error: inviteError } = await admin
    .from("team_invites")
    .select("team_id")
    .eq("token", parsed.data.token)
    .maybeSingle();

  if (inviteError || !inviteData?.team_id) {
    console.error("Invalid invite token", inviteError);
    return NextResponse.json({ error: "Invalid invite link" }, { status: 400 });
  }

  // Create parent profile using the RPC
  const { data, error } = await admin.rpc("join_team_as_parent", {
    p_access_code: parsed.data.token,
    p_user_id: userId,
    p_display_name: `${parsed.data.firstName} ${parsed.data.lastName}`
  });

  if (error) {
    console.error("join_team_as_parent failed", error);
    
    // Fallback: Try to create profile directly
    const displayName = `${parsed.data.firstName} ${parsed.data.lastName}`;
    const { error: insertError } = await admin
      .from("profiles")
      .insert({
        user_id: userId,
        team_id: inviteData.team_id,
        role: "parent",
        display_name: displayName,
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName
      });

    if (insertError) {
      console.error("Direct profile insert failed", insertError);
      return NextResponse.json(
        { error: "Unable to join team as parent." },
        { status: 500 }
      );
    }

    return NextResponse.json({ teamId: inviteData.team_id });
  }

  return NextResponse.json({ teamId: data });
}

