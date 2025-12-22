import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Card, LinkButton } from "@/components/ui";
import VideoClient from "../videos/[id]/videoClient";

export default async function ComparePage({
  searchParams
}: {
  searchParams: { left?: string; right?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getMyProfile();
  if (!profile) redirect("/onboarding");

  const left = searchParams.left ?? "";
  const right = searchParams.right ?? "";

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Compare</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Side-by-side review.
          </div>
        </div>
        <LinkButton href="/app">Back</LinkButton>
      </div>

      <Card>
        <div className="muted" style={{ fontSize: 13 }}>
          Tip: open a video, copy its ID from the URL, then paste it here.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <form>
            <input className="input" name="left" defaultValue={left} placeholder="Left video ID" style={{ minWidth: 240 }} />
            <input
              className="input"
              name="right"
              defaultValue={right}
              placeholder="Right video ID"
              style={{ minWidth: 240, marginLeft: 8 }}
            />
            <button className="btn btnPrimary" type="submit" style={{ marginLeft: 8 }}>
              Compare
            </button>
          </form>
        </div>
      </Card>

      {left && right ? (
        <div className="row" style={{ alignItems: "stretch" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <VideoClient videoId={left} />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <VideoClient videoId={right} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
