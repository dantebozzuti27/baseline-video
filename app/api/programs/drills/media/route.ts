import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  drillId: z.string().min(1),
  kind: z.enum(["internal_video", "external_link"]),
  videoId: z.string().min(1).optional(),
  externalUrl: z.string().trim().min(1).max(2000).optional(),
  title: z.string().trim().max(140).optional(),
  sortOrder: z.number().int().optional()
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

  const { data, error } = await supabase.rpc("add_program_drill_media", {
    p_drill_id: parsed.data.drillId,
    p_kind: parsed.data.kind,
    p_video_id: parsed.data.kind === "internal_video" ? parsed.data.videoId ?? null : null,
    p_external_url: parsed.data.kind === "external_link" ? parsed.data.externalUrl ?? null : null,
    p_title: parsed.data.title ?? null,
    p_sort_order: parsed.data.sortOrder ?? 0
  });

  if (error) {
    console.error("add_program_drill_media failed", error);
    return NextResponse.json({ error: "Unable to add media." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}


