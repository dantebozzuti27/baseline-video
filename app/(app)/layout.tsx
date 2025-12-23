import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { displayNameFromProfile } from "@/lib/utils/name";
import DrawerNav from "./DrawerNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const profile = await getMyProfile();
  if (!user) redirect("/sign-in");
  if (!profile) redirect("/onboarding");
  if ((profile as any).is_active === false) redirect("/inactive");

  return (
    <div>
      <div className="nav">
        <div className="navInner">
          <div className="bvTopBarLeft">
            <DrawerNav role={profile.role} displayName={displayNameFromProfile(profile)} />
            <Link className="brand" href="/app" aria-label="Baseline Video home">
              <img className="brandLogo" src="/brand.png" alt="Baseline Video" />
            </Link>
          </div>
          <div className="bvTopBarRight">
            <Link className="btn btnPrimary" href="/app/upload">
              Upload
            </Link>
          </div>
        </div>
      </div>
      <div className="container">{children}</div>
    </div>
  );
}


