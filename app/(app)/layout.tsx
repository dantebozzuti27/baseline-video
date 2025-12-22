import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { displayNameFromProfile } from "@/lib/utils/name";
import SignOutButton from "./SignOutButton";
import HeaderMenu from "./HeaderMenu";

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
          <Link className="brand" href={profile.role === "coach" ? "/dashboard" : "/app"}>
            Baseline Video
          </Link>
          <div className="bvDesktopNav row" style={{ alignItems: "center" }}>
            {profile?.role === "coach" ? (
              <>
                <Link className="pill" href="/dashboard">
                  Dashboard
                </Link>
                <Link className="pill" href="/library">
                  Library
                </Link>
                <Link className="pill" href="/compare">
                  Compare
                </Link>
              </>
            ) : null}
            <Link className="pill" href="/upload">
              Upload
            </Link>
            <Link className="pill" href="/settings">
              Account & team
            </Link>
            <Link className="pill" href="/trash">
              Trash
            </Link>
            <SignOutButton />
          </div>

          <HeaderMenu role={profile.role} displayName={displayNameFromProfile(profile)} email={user.email ?? ""} />
        </div>
      </div>
      <div className="container">{children}</div>
    </div>
  );
}


