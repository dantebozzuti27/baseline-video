import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeExternalUrl(input: unknown) {
  if (typeof input !== "string") return input;
  const raw = input.trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(raw) || /^www\./i.test(raw)) return `https://${raw}`;
  return raw;
}

const createSchema = z
  .object({
    title: z.string().min(1).max(120),
    category: z.enum(["game", "training"]),
    source: z.enum(["upload", "link"]).optional(),
    fileExt: z.string().min(1).max(12).optional(),
    externalUrl: z.preprocess(normalizeExternalUrl, z.string().url()).optional(),
    ownerUserId: z.string().uuid().optional(),
    pinned: z.boolean().optional(),
    isLibrary: z.boolean().optional()
  })
  .superRefine((v, ctx) => {
    const source = v.source ?? "upload";
    if (source === "upload") {
      if (!v.fileExt) ctx.addIssue({ code: "custom", message: "fileExt required", path: ["fileExt"] });
      if (v.externalUrl) ctx.addIssue({ code: "custom", message: "externalUrl not allowed", path: ["externalUrl"] });
      return;
    }
    // link
    if (!v.externalUrl) ctx.addIssue({ code: "custom", message: "externalUrl required", path: ["externalUrl"] });
    if (v.fileExt) ctx.addIssue({ code: "custom", message: "fileExt not allowed", path: ["fileExt"] });
    if (v.externalUrl && !/^https?:\/\//i.test(v.externalUrl)) {
      ctx.addIssue({ code: "custom", message: "URL must start with http(s)", path: ["externalUrl"] });
    }
  });

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    const source = (json as any)?.source;
    if (source === "link") {
      return NextResponse.json(
        {
          error: "That link doesn’t look valid. Try copying the full URL (starts with https://)."
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: "Please check your input and try again."
      },
      { status: 400 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("team_id, role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError || !profile?.team_id) return NextResponse.json({ error: "Profile missing" }, { status: 400 });
  if ((profile as any).is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = crypto.randomUUID();
  const source = parsed.data.source ?? "upload";
  const storagePath =
    source === "upload"
      ? (() => {
          const safeExt = String(parsed.data.fileExt ?? "mp4")
            .replace(/[^a-zA-Z0-9]/g, "")
            .toLowerCase();
          return `${profile.team_id}/${user.id}/${id}.${safeExt}`;
        })()
      : null;
  const externalUrl = source === "link" ? parsed.data.externalUrl : null;

  const ownerUserId = parsed.data.ownerUserId ?? user.id;
  const isCoach = profile.role === "coach";

  // Only coaches can upload for another player and only coaches can set pinned/library flags.
  const pinned = isCoach ? Boolean(parsed.data.pinned) : false;
  const isLibrary = isCoach ? Boolean(parsed.data.isLibrary) : false;

  if (parsed.data.ownerUserId && !isCoach) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // If coach uploads for a player, ensure the player is on the same team and active.
  if (isCoach && ownerUserId !== user.id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("user_id, team_id, role, is_active")
      .eq("user_id", ownerUserId)
      .maybeSingle();
    if (!owner || owner.team_id !== profile.team_id || owner.role !== "player" || owner.is_active === false) {
      return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
    }
  }

  const { error: insertError } = await supabase.from("videos").insert({
    id,
    team_id: profile.team_id,
    uploader_user_id: user.id,
    owner_user_id: ownerUserId,
    category: parsed.data.category,
    source,
    title: parsed.data.title,
    storage_path: storagePath,
    external_url: externalUrl,
    pinned,
    is_library: isLibrary
  });

  if (insertError) {
    console.error("video insert failed", insertError);
    return NextResponse.json(
      {
        error: "Unable to create video."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ id, storagePath, source, externalUrl });
}
