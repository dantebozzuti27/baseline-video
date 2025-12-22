import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: video, error } = await supabase
    .from("videos")
    .select("id, source, storage_path, external_url, deleted_at")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to load video." }, { status: 500 });
  }
  if (!video) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if ((video as any).deleted_at) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if ((video as any).source === "link") {
    const url = (video as any).external_url as string | null;
    if (!url) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ kind: "external", url });
  }

  const admin = createSupabaseAdminClient();
  const { data, error: signedError } = await admin.storage.from("videos").createSignedUrl(video.storage_path, 60 * 10);

  if (signedError || !data?.signedUrl) {
    return NextResponse.json({ error: "Unable to sign URL." }, { status: 500 });
  }

  return NextResponse.json({ kind: "storage", url: data.signedUrl });
}


