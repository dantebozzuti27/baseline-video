"use client";

import * as React from "react";
import Link from "next/link";
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
  accessCode: z.string().min(4),
  firstName: z.string().min(1),
  lastName: z.string().min(1)
});

export default function OnboardingClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"coach" | "player">("player");

  const [teamName, setTeamName] = React.useState("");
  const [accessCode, setAccessCode] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [createdAccessCode, setCreatedAccessCode] = React.useState<string | null>(null);

  const [teamPreview, setTeamPreview] = React.useState<{ teamName: string; coachName: string } | null>(null);
  const [previewErr, setPreviewErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (mode !== "player") return;

    let cancelled = false;
    async function run() {
      setPreviewErr(null);
      setTeamPreview(null);

      const code = accessCode.trim();
      if (code.length < 4) return;

      try {
        const resp = await fetch("/api/team/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessCode: code })
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to preview team");
        if (!cancelled && (json as any)?.ok) {
          setTeamPreview({ teamName: (json as any).teamName, coachName: (json as any).coachName });
        }
      } catch (e: any) {
        if (!cancelled) setPreviewErr(e?.message ?? "Unable to preview team");
      }
    }

    const t = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, accessCode]);

  async function getAccessToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "coach") {
      const parsed = coachSchema.safeParse({ teamName, firstName, lastName });
      if (!parsed.success) {
        setError("Please fill out all fields.");
        return;
      }
      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("You’re signed in, but we couldn’t find a session. Please sign out and back in.");

        const resp = await fetch("/api/onboarding/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(parsed.data)
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to create team.");

        setCreatedAccessCode((json as any)?.accessCode ?? null);
      } catch (err: any) {
        setError(err?.message ?? "Unable to finish setup.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const parsed = playerSchema.safeParse({
      accessCode: accessCode.trim(),
      firstName,
      lastName
    });
    if (!parsed.success) {
      setError("Please fill out all fields.");
      return;
    }

    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("You’re signed in, but we couldn’t find a session. Please sign out and back in.");

      const resp = await fetch("/api/onboarding/player", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          accessCode: parsed.data.accessCode.toUpperCase(),
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to join team.");

      router.replace(nextPath || "/app");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Unable to finish setup.");
    } finally {
      setLoading(false);
    }
  }

  if (createdAccessCode) {
    return (
      <div className="container" style={{ maxWidth: 520, paddingTop: 56 }}>
        <Card>
          <div className="stack">
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Team created</div>
              <div className="muted" style={{ marginTop: 6 }}>
                Share this access code with your players.
              </div>
            </div>

            <div className="card">
              <div className="label">Team access code</div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.08em", marginTop: 6 }}>
                {createdAccessCode}
              </div>
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                Players can sign up at <b>Sign up → I’m a player</b>.
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

            <div className="muted" style={{ fontSize: 13 }}>
              Want to use invite links instead? Go to <Link href="/app/settings">Team settings</Link>.
            </div>
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
                  label="Team access code"
                  name="accessCode"
                  value={accessCode}
                  onChange={(v) => setAccessCode(v.toUpperCase())}
                  placeholder="A1B2C3D4"
                />

                {teamPreview ? (
                  <div className="card">
                    <div className="label">Team</div>
                    <div style={{ fontWeight: 900, marginTop: 6 }}>{teamPreview.teamName}</div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Coach: {teamPreview.coachName}</div>
                  </div>
                ) : previewErr ? (
                  <div className="muted" style={{ fontSize: 13 }}>
                    {previewErr}
                  </div>
                ) : null}
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

            {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}

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


