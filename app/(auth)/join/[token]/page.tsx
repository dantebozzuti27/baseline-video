"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input } from "@/components/ui";

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

export default function JoinByInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const token = params.token;

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  // Per request: do not show error/failure messages in the UI.

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = schema.safeParse({ firstName, lastName, email, password });
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

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("missing_session");
      }

      // Use server API to join via invite (service role RPC)
      const resp = await fetch("/api/onboarding/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ token, firstName: parsed.data.firstName, lastName: parsed.data.lastName })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to join team.");

      router.replace("/app");
      router.refresh();
    } catch (e: any) {
      console.error("join by invite failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 56 }}>
      <Card>
        <div className="stack">
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Join team</div>
            <div className="muted" style={{ marginTop: 6 }}>
              You were invited by your coach.
            </div>
          </div>

          <form className="stack" onSubmit={onSubmit}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 180 }}>
                <Input label="First name" name="firstName" value={firstName} onChange={setFirstName} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <Input label="Last name" name="lastName" value={lastName} onChange={setLastName} />
              </div>
            </div>
            <Input label="Email" name="email" type="email" value={email} onChange={setEmail} />
            <Input label="Password" name="password" type="password" value={password} onChange={setPassword} />

            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? "Joining…" : "Create account & join"}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
