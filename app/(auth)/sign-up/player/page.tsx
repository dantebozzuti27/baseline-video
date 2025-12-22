"use client";

import * as React from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input } from "@/components/ui";

const schema = z.object({
  accessCode: z.string().min(4),
  displayName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8)
});

export default function PlayerSignUpPage() {
  const router = useRouter();
  const [accessCode, setAccessCode] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = schema.safeParse({ accessCode, displayName, email, password });
    if (!parsed.success) {
      setError("Please fill out all fields (password must be 8+ characters).");
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
        throw new Error("No session returned from sign up. Check Supabase auth settings (email confirmation?).");
      }

      const resp = await fetch("/api/onboarding/player", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accessCode: parsed.data.accessCode, displayName: parsed.data.displayName })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Unable to join team.");

      router.replace("/app");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Unable to sign up.");
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
            Enter the access code from your coach.
          </div>
        </div>

        <form className="stack" onSubmit={onSubmit}>
          <Input
            label="Team access code"
            name="accessCode"
            value={accessCode}
            onChange={(v) => setAccessCode(v.toUpperCase())}
            placeholder="A1B2C3D4"
          />
          <Input label="Your name" name="displayName" value={displayName} onChange={setDisplayName} placeholder="Player Name" />
          <Input label="Email" name="email" type="email" value={email} onChange={setEmail} />
          <Input label="Password" name="password" type="password" value={password} onChange={setPassword} />
          {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Joining…" : "Join team"}
          </Button>
        </form>
      </div>
    </Card>
  );
}


