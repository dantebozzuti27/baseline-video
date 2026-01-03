"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input } from "@/components/ui";

const coachSchema = z.object({
  teamName: z.string().min(2),
  firstName: z.string().min(1),
  lastName: z.string().min(1)
});

const playerSchema = z.object({
  invite: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1)
});

function tokenFromInviteInput(raw: string) {
  const s = raw.trim();
  if (!s) return "";
  const m = s.match(/\/join\/([^/?#]+)/i);
  if (m?.[1]) return m[1];
  return s;
}

export default function OnboardingClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"coach" | "player">("player");

  const [teamName, setTeamName] = React.useState("");
  const [invite, setInvite] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  // Per request: do not show error/failure messages in the UI.

  const [createdInviteToken, setCreatedInviteToken] = React.useState<string | null>(null);

  async function getAccessToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "coach") {
      const parsed = coachSchema.safeParse({ teamName, firstName, lastName });
      if (!parsed.success) {
        return;
      }
      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("missing_session");

        const resp = await fetch("/api/onboarding/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(parsed.data)
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to create team.");

        const inv = await fetch("/api/team/invite", { method: "GET" });
        const invJson = await inv.json().catch(() => ({}));
        if (!inv.ok) throw new Error((invJson as any)?.error ?? "Unable to load invite link.");
        setCreatedInviteToken((invJson as any)?.token ?? null);
      } catch (err: any) {
        console.error("onboarding coach failed", err);
      } finally {
        setLoading(false);
      }
      return;
    }

    const parsed = playerSchema.safeParse({
      invite: tokenFromInviteInput(invite),
      firstName,
      lastName
    });
    if (!parsed.success) {
      return;
    }

    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("missing_session");

      const resp = await fetch("/api/onboarding/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          token: parsed.data.invite,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to join team.");

      router.replace(nextPath || "/app");
      router.refresh();
    } catch (err: any) {
      console.error("onboarding player failed", err);
    } finally {
      setLoading(false);
    }
  }

  if (createdInviteToken) {
    const url = typeof window !== "undefined" ? `${window.location.origin}/join/${createdInviteToken}` : "";
    return (
      <div className="container" style={{ maxWidth: 520, paddingTop: 56 }}>
        <Card>
          <div className="stack">
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Team created</div>
              <div className="muted" style={{ marginTop: 6 }}>
                Share this invite link with your players.
              </div>
            </div>

            <div className="card">
              <div className="label">Invite link</div>
              <div style={{ marginTop: 6, fontWeight: 800, wordBreak: "break-all" }}>{url}</div>
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                Players can sign up using this link.
              </div>
            </div>

            <Button
              variant="primary"
              onClick={() => {
                router.replace("/app/dashboard");
                router.refresh();
              }}
            >
              Go to dashboard
            </Button>

            <div className="muted" style={{ fontSize: 13 }}>You can also find this link in Settings.</div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 56 }}>
      <Card>
        <div className="stack">
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Finish setup</div>
            <div className="muted" style={{ marginTop: 6 }}>
              You’re signed in. Now choose whether you’re a coach or a player.
            </div>
          </div>

          <div className="row">
            <Button variant={mode === "player" ? "primary" : "default"} onClick={() => setMode("player")} disabled={loading}>
              I’m a player
            </Button>
            <Button variant={mode === "coach" ? "primary" : "default"} onClick={() => setMode("coach")} disabled={loading}>
              I’m a coach
            </Button>
          </div>

          <form className="stack" onSubmit={onSubmit}>
            {mode === "coach" ? (
              <>
                <Input label="Team name" name="teamName" value={teamName} onChange={setTeamName} placeholder="Putsky Hitting" />
              </>
            ) : (
              <>
                <Input
                  label="Invite link (or code)"
                  name="invite"
                  value={invite}
                  onChange={setInvite}
                  placeholder="https://…/join/abcd…"
                />
              </>
            )}

            <div className="row">
              <div style={{ flex: 1, minWidth: 180 }}>
                <Input label="First name" name="firstName" value={firstName} onChange={setFirstName} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <Input label="Last name" name="lastName" value={lastName} onChange={setLastName} />
              </div>
            </div>

            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? "Saving…" : "Continue"}
            </Button>
          </form>

          <div className="muted" style={{ fontSize: 13 }}>
            Not you?{" "}
            <Button
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await fetch("/api/auth/sign-out", { method: "POST" });
                } finally {
                  setLoading(false);
                  router.replace("/sign-in");
                  router.refresh();
                }
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}


