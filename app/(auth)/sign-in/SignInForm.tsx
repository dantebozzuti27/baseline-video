"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input } from "@/components/ui";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export default function SignInForm({ nextUrl }: { nextUrl: string }) {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password
      });
      if (signInError) throw signInError;
      router.replace(nextUrl);
      router.refresh();
    } catch (err: any) {
      console.error("sign in failed", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="stack">
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Sign in</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Get back to your video feed.
          </div>
        </div>

        <form className="stack" onSubmit={onSubmit}>
          <Input label="Email" name="email" type="email" value={email} onChange={setEmail} placeholder="coach@team.com" />
          <Input label="Password" name="password" type="password" value={password} onChange={setPassword} />
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="muted" style={{ fontSize: 13 }}>
          New here? <Link href="/sign-up">Create an account</Link>
        </div>
      </div>
    </Card>
  );
}
