import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { displayNameFromProfile } from "@/lib/utils/name";
import SignOutButton from "./SignOutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const profile = await getMyProfile();

  return (
    <div>
      <div className="nav">
        <div className="navInner">
          <Link className="brand" href="/app">
            Baseline Video
          </Link>
          <div className="row" style={{ alignItems: "center" }}>
            {profile ? <div className="pill">{profile.role === "coach" ? "Coach" : "Player"}</div> : null}
            {profile?.role === "coach" ? (
              <>
                <Link className="pill" href="/app/dashboard">
                  Dashboard
                </Link>
                <Link className="pill" href="/app/compare">
                  Compare
                </Link>
              </>
            ) : null}
            <Link className="pill" href="/app/upload">
              Upload
            </Link>
            {profile ? (
              <>
                <Link className="pill" href="/app/profile">
                  {displayNameFromProfile(profile)}
                </Link>
                {profile.role === "coach" ? (
                  <Link className="pill" href="/app/settings">
                    Settings
                  </Link>
                ) : null}
              </>
            ) : null}
            {user ? <div className="pill">{user.email}</div> : null}
            <SignOutButton />
          </div>
        </div>
      </div>
      <div className="container">{children}</div>
    </div>
  );
}


