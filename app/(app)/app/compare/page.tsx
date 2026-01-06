import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/auth/profile";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import CompareClient from "./CompareClient";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams
}: {
  searchParams: { left?: string; right?: string };
}) {
  const supabase = createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getMyProfile();
  if (!profile) redirect("/onboarding");
  if (profile.role !== "coach") redirect("/app");

  const left = searchParams.left ?? "";
  const right = searchParams.right ?? "";

  // Get videos for selection
  const { data: vids } = await supabase
    .from("videos")
    .select("id, title, created_at, owner_user_id, is_library, storage_path, external_url, source")
    .eq("team_id", profile.team_id)
    .is("deleted_at", null)
    .order("is_library", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const ownerIds = Array.from(new Set((vids ?? []).map((v: any) => v.owner_user_id).filter(Boolean)));
  const { data: owners } = ownerIds.length
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds)
    : { data: [] as any[] };
  const ownerMap = new Map<string, string>();
  for (const o of owners ?? []) ownerMap.set(o.user_id, o.display_name);

  // Get signed URLs for selected videos
  const selectedIds = [left, right].filter(Boolean);
  const signedUrls: Record<string, string> = {};

  for (const vid of vids ?? []) {
    if (selectedIds.includes(vid.id)) {
      if (vid.source === "link" && vid.external_url) {
        signedUrls[vid.id] = vid.external_url;
      } else if (vid.storage_path) {
        const { data: signedData } = await admin.storage
          .from("videos")
          .createSignedUrl(vid.storage_path, 3600);
        if (signedData?.signedUrl) {
          signedUrls[vid.id] = signedData.signedUrl;
        }
      }
    }
  }

  // Format videos for client
  const videos = (vids ?? []).map((v: any) => ({
    id: v.id,
    title: v.title,
    owner_name: ownerMap.get(v.owner_user_id) ?? (v.is_library ? "Library" : "Player"),
    created_at: v.created_at,
    signed_url: signedUrls[v.id] || undefined
  }));

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Compare" }
        ]}
      />

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
          Side-by-Side Compare
        </h1>
        <p className="muted">
          Compare swings, mechanics, or track progress over time
        </p>
      </div>

      <CompareClient 
        videos={videos} 
        initialLeft={left} 
        initialRight={right} 
      />
    </div>
  );
}
