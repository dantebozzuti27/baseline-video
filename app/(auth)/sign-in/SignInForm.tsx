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
    <Card className="bvAuthCard">
      <div className="stack" style={{ gap: 20 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>Welcome back</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Sign in to access your team
          </div>
        </div>

        <form className="stack" style={{ gap: 16 }} onSubmit={onSubmit}>
          <Input label="Email" name="email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Input label="Password" name="password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
          <div style={{ marginTop: 8 }}>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>

        <div className="bvDivider">
          <span>or</span>
        </div>

        <div style={{ textAlign: "center" }}>
          <div className="muted" style={{ fontSize: 14 }}>
            Don't have an account?{" "}
            <Link href="/sign-up" style={{ color: "var(--primary)", fontWeight: 600 }}>
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
