import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Button } from "@/components/ui";

async function SignOutButton() {
  async function signOut() {
    "use server";
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  return (
    <form action={signOut}>
      <Button type="submit">Sign out</Button>
    </form>
  );
}

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
            {user ? <div className="pill">{user.email}</div> : null}
            <SignOutButton />
          </div>
        </div>
      </div>
      <div className="container">{children}</div>
    </div>
  );
}


