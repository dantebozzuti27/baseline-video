import Link from "next/link";
import { Card, Pill } from "@/components/ui";
import { Users, UserCircle, ArrowRight } from "lucide-react";

export default function SignUpChooserPage() {
  return (
    <Card className="bvAuthCard">
      <div className="stack" style={{ gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>
            Get started
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Choose your role to continue
          </div>
        </div>

        <div className="stack" style={{ gap: 12 }}>
          <Link href="/sign-up/coach" className="bvRoleCard">
            <div className="bvRoleCardIcon">
              <Users size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 800 }}>I'm a coach</div>
                <Pill variant="info">COACH</Pill>
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                Create a team and invite your players
              </div>
            </div>
            <ArrowRight size={20} className="bvRoleCardArrow" />
          </Link>

          <Link href="/sign-up/player" className="bvRoleCard">
            <div className="bvRoleCardIcon">
              <UserCircle size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 800 }}>I'm a player</div>
                <Pill variant="success">PLAYER</Pill>
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                Join using your coach's invite link
              </div>
            </div>
            <ArrowRight size={20} className="bvRoleCardArrow" />
          </Link>
        </div>

        <div className="bvDivider">
          <span>or</span>
        </div>

        <div style={{ textAlign: "center" }}>
          <div className="muted" style={{ fontSize: 14 }}>
            Already have an account?{" "}
            <Link href="/sign-in" style={{ color: "var(--primary)", fontWeight: 600 }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}


