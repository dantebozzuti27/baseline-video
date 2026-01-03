"use client";

import * as React from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input } from "@/components/ui";

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
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Coach sign up</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Create your team and get a permanent invite link for players.
          </div>
        </div>

        {inviteUrl ? (
          <div className="stack">
            <div className="card">
              <div className="label">Invite link</div>
              <div style={{ marginTop: 6, fontWeight: 800, wordBreak: "break-all" }}>{inviteUrl}</div>
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                Share this with your players. They’ll create an account and join your team.
              </div>
            </div>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                } catch {
                  // ignore
                }
              }}
            >
              Copy invite link
            </Button>
            {copied ? <div className="muted" style={{ fontSize: 13 }}>Copied.</div> : null}
            <Button
              variant="primary"
              onClick={() => {
                router.replace("/app/dashboard");
                router.refresh();
              }}
            >
              Go to dashboard
            </Button>
          </div>
        ) : (
          <form className="stack" onSubmit={onSubmit}>
            <Input label="Team name" name="teamName" value={teamName} onChange={setTeamName} placeholder="Putsky Hitting" />
            <div className="row">
              <div style={{ flex: 1, minWidth: 180 }}>
                <Input label="First name" name="firstName" value={firstName} onChange={setFirstName} placeholder="Dan" />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <Input label="Last name" name="lastName" value={lastName} onChange={setLastName} placeholder="Putsky" />
              </div>
            </div>
            <Input label="Email" name="email" type="email" value={email} onChange={setEmail} />
            <Input label="Password" name="password" type="password" value={password} onChange={setPassword} />
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create team"}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
