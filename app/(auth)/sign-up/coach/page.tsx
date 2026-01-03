"use client";

import * as React from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input, Pill } from "@/components/ui";
import { toast } from "@/app/(app)/toast";

const schema = z.object({
  teamName: z.string().min(2),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

function siteOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}

export default function CoachSignUpPage() {
  const router = useRouter();
  const [teamName, setTeamName] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  // Per request: do not show error/failure messages in the UI.
  const [inviteToken, setInviteToken] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = schema.safeParse({ teamName, firstName, lastName, email, password });
    if (!parsed.success) {
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password
      });
      if (signUpError) throw signUpError;

      const token = data.session?.access_token;
      if (!token) {
        throw new Error("missing_session");
      }

      const resp = await fetch("/api/onboarding/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          teamName: parsed.data.teamName,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName
        })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Unable to create team.");

      // Create/load stable team invite link
      const inv = await fetch("/api/team/invite", { method: "GET" });
      const invJson = await inv.json().catch(() => ({}));
      if (!inv.ok) throw new Error((invJson as any)?.error ?? "Unable to load invite link.");
      setInviteToken((invJson as any).token ?? null);
    } catch (err: any) {
      console.error("coach sign up failed", err);
    } finally {
      setLoading(false);
    }
  }

  const inviteUrl = inviteToken ? `${siteOrigin()}/join/${inviteToken}` : null;

  return (
    <Card className="bvAuthCard">
      <div className="stack" style={{ gap: 20 }}>
        <div style={{ textAlign: "center" }}>
          <Pill variant="info">COACH</Pill>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 12 }}>
            Create your team
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Set up your coaching account and invite players
          </div>
        </div>

        {inviteUrl ? (
          <div className="stack" style={{ gap: 16 }}>
            <div className="card" style={{ background: "var(--surface)", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--success)", fontWeight: 600, marginBottom: 8 }}>
                ✓ Team created successfully
              </div>
              <div className="label">Your invite link</div>
              <div style={{ marginTop: 8, fontWeight: 700, wordBreak: "break-all", fontSize: 14 }}>{inviteUrl}</div>
              <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                Share this with your players to let them join
              </div>
            </div>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  toast("Invite link copied");
                } catch {
                  // ignore
                }
              }}
            >
              Copy invite link
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                router.replace("/app/dashboard");
                router.refresh();
              }}
            >
              Go to dashboard →
            </Button>
          </div>
        ) : (
          <form className="stack" style={{ gap: 16 }} onSubmit={onSubmit}>
            <Input label="Team name" name="teamName" value={teamName} onChange={setTeamName} placeholder="Elite Hitting Academy" />
            <div className="row">
              <div style={{ flex: 1, minWidth: 160 }}>
                <Input label="First name" name="firstName" value={firstName} onChange={setFirstName} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <Input label="Last name" name="lastName" value={lastName} onChange={setLastName} />
              </div>
            </div>
            <Input label="Email" name="email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            <Input label="Password" name="password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
            <div style={{ marginTop: 8 }}>
              <Button variant="primary" type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create team"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
