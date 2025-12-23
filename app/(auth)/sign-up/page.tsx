import Link from "next/link";
import { Card, Button } from "@/components/ui";

export default function SignUpChooserPage() {
  return (
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Create your account</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Coaches create a team. Players join with a coach’s invite link.
          </div>
        </div>

        <div className="row">
          <Link href="/sign-up/coach" style={{ flex: 1, minWidth: 200 }}>
            <div className="card">
              <div style={{ fontWeight: 800 }}>I’m a coach</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                Create a team and share an invite link.
              </div>
              <div style={{ marginTop: 12 }}>
                <Button variant="primary">Continue</Button>
              </div>
            </div>
          </Link>

          <Link href="/sign-up/player" style={{ flex: 1, minWidth: 200 }}>
            <div className="card">
              <div style={{ fontWeight: 800 }}>I’m a player</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                Open the invite link from your coach.
              </div>
              <div style={{ marginTop: 12 }}>
                <Button variant="primary">Continue</Button>
              </div>
            </div>
          </Link>
        </div>

        <div className="muted" style={{ fontSize: 13 }}>
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </div>
      </div>
    </Card>
  );
}


