"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Card, Input } from "@/components/ui";
import { toast } from "@/app/(app)/toast";
import { 
  User, 
  Users, 
  ArrowRight, 
  Check,
  Upload,
  Calendar,
  MessageCircle,
  Copy
} from "lucide-react";

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

const parentSchema = z.object({
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

type Role = "coach" | "player" | "parent";
type Step = "role" | "details" | "success";

const roleInfo: Record<Role, { icon: React.ReactNode; title: string; description: string }> = {
  coach: {
    icon: <Users size={32} />,
    title: "Coach",
    description: "Create a team, invite players, and analyze their videos"
  },
  player: {
    icon: <User size={32} />,
    title: "Player",
    description: "Upload videos, get feedback, and track your progress"
  },
  parent: {
    icon: <Users size={32} />,
    title: "Parent",
    description: "View your child's videos, feedback, and lesson schedule"
  }
};

export default function OnboardingClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("role");
  const [role, setRole] = React.useState<Role>("player");

  const [teamName, setTeamName] = React.useState("");
  const [invite, setInvite] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);

  async function getAccessToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function handleContinue() {
    if (step === "role") {
      setStep("details");
      return;
    }

    // Handle form submission
    if (role === "coach") {
      const parsed = coachSchema.safeParse({ teamName, firstName, lastName });
      if (!parsed.success) return;

      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("missing_session");

        const resp = await fetch("/api/onboarding/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(parsed.data)
        });
        if (!resp.ok) throw new Error("Unable to create team");

        // Get invite link
        const inv = await fetch("/api/team/invite", { method: "GET" });
        const invJson = await inv.json().catch(() => ({}));
        if (inv.ok && invJson.token) {
          const url = `${window.location.origin}/join/${invJson.token}`;
          setInviteUrl(url);
        }

        setStep("success");
      } catch (err: any) {
        console.error("coach onboarding failed", err);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Player or Parent
    const parsed = role === "parent" 
      ? parentSchema.safeParse({ invite: tokenFromInviteInput(invite), firstName, lastName })
      : playerSchema.safeParse({ invite: tokenFromInviteInput(invite), firstName, lastName });
    
    if (!parsed.success) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("missing_session");

      // For parent, use a different endpoint
      const endpoint = role === "parent" ? "/api/onboarding/parent" : "/api/onboarding/invite";
      
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          token: parsed.data.invite,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName
        })
      });
      
      if (!resp.ok) throw new Error("Unable to join team");

      setStep("success");
    } catch (err: any) {
      console.error("onboarding failed", err);
    } finally {
      setLoading(false);
    }
  }

  function handleComplete() {
    console.log("[Onboarding] handleComplete called, role:", role);
    const destination = role === "coach" 
      ? "/app/dashboard" 
      : role === "parent" 
        ? "/app/parent" 
        : "/app";
    console.log("[Onboarding] Navigating to:", destination);
    // Use window.location for a hard navigation to ensure it works
    window.location.href = destination;
  }

  async function copyInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast("Copied invite link!");
    } catch {
      // fallback
    }
  }

  // Step 1: Choose Role
  if (step === "role") {
    return (
      <div className="container" style={{ maxWidth: 520, paddingTop: 40 }}>
        <div className="stack" style={{ gap: 24 }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
              Welcome to Baseline
            </h1>
            <p className="muted" style={{ fontSize: 16 }}>
              How will you be using the app?
            </p>
          </div>

          <div className="stack" style={{ gap: 12 }}>
            {(["coach", "player", "parent"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={role === r ? "card cardInteractive" : "card"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: 20,
                  textAlign: "left",
                  cursor: "pointer",
                  border: role === r ? "2px solid var(--primary)" : undefined,
                  background: role === r ? "rgba(99, 179, 255, 0.08)" : undefined
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: role === r ? "var(--primary)" : "rgba(255, 255, 255, 0.08)",
                    color: role === r ? "white" : "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {roleInfo[r].icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{roleInfo[r].title}</div>
                  <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>
                    {roleInfo[r].description}
                  </div>
                </div>
                {role === r && <Check size={24} color="var(--primary)" />}
              </button>
            ))}
          </div>

          <Button variant="primary" onClick={handleContinue} fullWidth>
            Continue
            <ArrowRight size={18} />
          </Button>

          <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
            <button
              className="btn"
              onClick={async () => {
                await fetch("/api/auth/sign-out", { method: "POST" });
                router.replace("/sign-in");
                router.refresh();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Details
  if (step === "details") {
    return (
      <div className="container" style={{ maxWidth: 520, paddingTop: 40 }}>
        <Card>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); handleContinue(); }}>
            <div>
              <button 
                type="button" 
                className="btn" 
                onClick={() => setStep("role")}
                style={{ marginBottom: 16 }}
              >
                ← Back
              </button>
              <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
                {role === "coach" ? "Create your team" : "Join a team"}
              </h2>
              <p className="muted">
                {role === "coach" 
                  ? "Set up your team and invite players"
                  : `Enter the invite link from your ${role === "parent" ? "child's coach" : "coach"}`}
              </p>
            </div>

            {role === "coach" ? (
              <Input
                label="Team name"
                name="teamName"
                value={teamName}
                onChange={setTeamName}
                placeholder="e.g., Warriors Baseball"
              />
            ) : (
              <Input
                label="Invite link or code"
                name="invite"
                value={invite}
                onChange={setInvite}
                placeholder="Paste the invite link here"
              />
            )}

            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Input
                  label="First name"
                  name="firstName"
                  value={firstName}
                  onChange={setFirstName}
                  placeholder="John"
                />
              </div>
              <div style={{ flex: 1 }}>
                <Input
                  label="Last name"
                  name="lastName"
                  value={lastName}
                  onChange={setLastName}
                  placeholder="Smith"
                />
              </div>
            </div>

            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? "Setting up…" : role === "coach" ? "Create Team" : "Join Team"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // Step 3: Success
  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 40 }}>
      <div className="stack" style={{ gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "rgba(74, 222, 128, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px"
            }}
          >
            <Check size={40} color="#4ade80" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
            {role === "coach" ? "Team Created!" : "You're In!"}
          </h1>
          <p className="muted" style={{ fontSize: 16 }}>
            {role === "coach" 
              ? "Your team is ready. Here's how to get started:"
              : role === "parent"
                ? "You're connected to your child's account."
                : "Welcome to the team. Here's what's next:"}
          </p>
        </div>

        {role === "coach" && inviteUrl && (
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Invite your players</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                background: "rgba(255, 255, 255, 0.04)",
                borderRadius: 8,
                fontSize: 13,
                wordBreak: "break-all"
              }}
            >
              <span style={{ flex: 1 }}>{inviteUrl}</span>
              <button className="btn" onClick={copyInviteLink}>
                <Copy size={14} />
              </button>
            </div>
          </Card>
        )}

        <div className="stack" style={{ gap: 12 }}>
          {role === "coach" ? (
            <>
              <OnboardingTip
                icon={<Upload size={20} />}
                title="Upload a video"
                description="Add your first training clip to see it in action"
              />
              <OnboardingTip
                icon={<Users size={20} />}
                title="Invite players"
                description="Share the invite link with your players"
              />
              <OnboardingTip
                icon={<Calendar size={20} />}
                title="Set your availability"
                description="Let players book lessons at times that work for you"
              />
            </>
          ) : role === "player" ? (
            <>
              <OnboardingTip
                icon={<Upload size={20} />}
                title="Upload your first video"
                description="Record a swing or drill and share it with your coach"
              />
              <OnboardingTip
                icon={<MessageCircle size={20} />}
                title="Get feedback"
                description="Your coach will comment with tips and cues"
              />
              <OnboardingTip
                icon={<Calendar size={20} />}
                title="Book lessons"
                description="Request lesson times that work for you"
              />
            </>
          ) : (
            <>
              <OnboardingTip
                icon={<Upload size={20} />}
                title="View videos"
                description="See all of your child's uploaded videos and feedback"
              />
              <OnboardingTip
                icon={<Calendar size={20} />}
                title="Track lessons"
                description="Stay updated on upcoming and past lessons"
              />
              <OnboardingTip
                icon={<MessageCircle size={20} />}
                title="See progress"
                description="Follow along with coach comments and program progress"
              />
            </>
          )}
        </div>

        <Button variant="primary" onClick={handleComplete} fullWidth>
          Get Started
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}

function OnboardingTip({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "rgba(99, 179, 255, 0.15)",
          color: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{description}</div>
      </div>
    </div>
  );
}
