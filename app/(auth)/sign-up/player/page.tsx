"use client";

import * as React from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input } from "@/components/ui";

const schema = z.object({
  invite: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

function tokenFromInviteInput(raw: string) {
  const s = raw.trim();
  if (!s) return "";
  // Allow pasting the full URL or just the token.
  const m = s.match(/\/join\/([^/?#]+)/i);
  if (m?.[1]) return m[1];
  return s;
}

export default function PlayerSignUpPage() {
  const router = useRouter();
  const [invite, setInvite] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  // Per request: do not show error/failure messages in the UI.

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = schema.safeParse({ invite: tokenFromInviteInput(invite), firstName, lastName, email, password });
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

      const resp = await fetch("/api/onboarding/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          token: parsed.data.invite,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName
        })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to join team.");

      router.replace("/app");
      router.refresh();
    } catch (err: any) {
      console.error("player sign up failed", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Player sign up</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Paste the invite link from your coach.
          </div>
        </div>

        <form className="stack" onSubmit={onSubmit}>
          <Input
            label="Invite link (or code)"
            name="invite"
            value={invite}
            onChange={setInvite}
            placeholder="https://…/join/abcd…"
          />

          <div className="row">
            <div style={{ flex: 1, minWidth: 180 }}>
              <Input label="First name" name="firstName" value={firstName} onChange={setFirstName} placeholder="Jane" />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Input label="Last name" name="lastName" value={lastName} onChange={setLastName} placeholder="Doe" />
            </div>
          </div>
          <Input label="Email" name="email" type="email" value={email} onChange={setEmail} />
          <Input label="Password" name="password" type="password" value={password} onChange={setPassword} />
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Joining…" : "Join team"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
