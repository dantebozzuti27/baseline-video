"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input, Pill } from "@/components/ui";
import { Spinner } from "@/components/Spinner";
import { UserCheck, AlertCircle, CheckCircle } from "lucide-react";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type ClaimInfo = {
  playerId: string;
  firstName: string;
  lastName: string;
  teamName: string;
  coachName: string;
  isExpired: boolean;
  isClaimed: boolean;
};

export default function ClaimPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const token = params.token;

  const [loading, setLoading] = React.useState(true);
  const [info, setInfo] = React.useState<ClaimInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [claiming, setClaiming] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  // Load claim info
  React.useEffect(() => {
    async function load() {
      try {
        const resp = await fetch(`/api/claim/${token}`);
        const data = await resp.json();
        if (!resp.ok) {
          setError(data.error ?? "Invalid claim link");
          return;
        }
        setInfo(data);
      } catch (e) {
        setError("Unable to load claim info");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      return;
    }

    setClaiming(true);
    try {
      // 1. Create the auth account
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password
      });

      if (signUpError) throw signUpError;

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("Missing session");
      }

      // 2. Claim the account (link to existing profile)
      const resp = await fetch(`/api/claim/${token}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json.error ?? "Unable to claim account");
      }

      setSuccess(true);
      
      // Redirect to app after brief delay
      setTimeout(() => {
        router.replace("/app");
        router.refresh();
      }, 1500);
    } catch (err: any) {
      console.error("claim failed:", err);
      setError(err?.message ?? "Unable to claim account");
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ maxWidth: 440, paddingTop: 56 }}>
        <Card className="bvAuthCard">
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spinner />
            <div className="muted" style={{ marginTop: 16 }}>Loading...</div>
          </div>
        </Card>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="container" style={{ maxWidth: 440, paddingTop: 56 }}>
        <Card className="bvAuthCard">
          <div className="stack" style={{ gap: 20, textAlign: "center" }}>
            <div className="bvEmptyIcon" style={{ margin: "0 auto" }}>
              <AlertCircle size={48} strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Invalid Link</div>
            <div className="muted">{error}</div>
            <Button variant="primary" onClick={() => router.push("/sign-in")}>
              Go to sign in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (info?.isClaimed) {
    return (
      <div className="container" style={{ maxWidth: 440, paddingTop: 56 }}>
        <Card className="bvAuthCard">
          <div className="stack" style={{ gap: 20, textAlign: "center" }}>
            <div className="bvEmptyIcon" style={{ margin: "0 auto" }}>
              <CheckCircle size={48} strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Already Claimed</div>
            <div className="muted">
              This account has already been claimed. Sign in to continue.
            </div>
            <Button variant="primary" onClick={() => router.push("/sign-in")}>
              Sign in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (info?.isExpired) {
    return (
      <div className="container" style={{ maxWidth: 440, paddingTop: 56 }}>
        <Card className="bvAuthCard">
          <div className="stack" style={{ gap: 20, textAlign: "center" }}>
            <div className="bvEmptyIcon" style={{ margin: "0 auto" }}>
              <AlertCircle size={48} strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Link Expired</div>
            <div className="muted">
              This claim link has expired. Ask your coach for a new one.
            </div>
            <Button variant="primary" onClick={() => router.push("/")}>
              Back to home
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container" style={{ maxWidth: 440, paddingTop: 56 }}>
        <Card className="bvAuthCard">
          <div className="stack" style={{ gap: 20, textAlign: "center" }}>
            <div className="bvEmptyIcon" style={{ margin: "0 auto", color: "var(--success)" }}>
              <CheckCircle size={48} strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Account Claimed!</div>
            <div className="muted">
              Welcome to {info?.teamName}. Redirecting...
            </div>
            <Spinner />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 440, paddingTop: 56 }}>
      <Card className="bvAuthCard">
        <div className="stack" style={{ gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div className="bvEmptyIcon" style={{ margin: "0 auto 16px" }}>
              <UserCheck size={48} strokeWidth={1.5} />
            </div>
            <Pill variant="success">INVITED</Pill>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 12 }}>
              Welcome, {info?.firstName}!
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              {info?.coachName} invited you to join
            </div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{info?.teamName}</div>
          </div>

          <form className="stack" style={{ gap: 16 }} onSubmit={onSubmit}>
            <div className="bvDivider">
              <span>set up your account</span>
            </div>

            <Input
              label="Email"
              name="email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              name="password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              hint="At least 8 characters"
            />

            {error && (
              <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>
            )}

            <div style={{ marginTop: 8 }}>
              <Button variant="primary" type="submit" disabled={claiming} fullWidth>
                {claiming ? "Claiming..." : "Claim my account"}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}

