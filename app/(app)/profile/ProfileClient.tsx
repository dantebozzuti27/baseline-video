"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Modal, Pill } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Avatar } from "@/components/Avatar";
import { toast } from "../toast";

export default function ProfileClient({
  initialFirstName,
  initialLastName,
  email,
  role
}: {
  initialFirstName: string;
  initialLastName: string;
  email: string;
  role: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState(initialFirstName);
  const [lastName, setLastName] = React.useState(initialLastName);
  const [saving, setSaving] = React.useState(false);

  const [confirm, setConfirm] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  const displayName = `${firstName} ${lastName}`.trim() || email;

  async function save() {
    setSaving(true);

    try {
      const resp = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to save");
      toast("Profile saved");
      router.refresh();
    } catch (e: any) {
      console.error("save profile failed", e);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const resp = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to delete account");

      // Ensure local session is cleared
      await fetch("/api/auth/sign-out", { method: "POST" });
      router.replace("/sign-in");
      router.refresh();
    } catch (e: any) {
      console.error("delete account failed", e);
    } finally {
      setDeleting(false);
    }
  }

  const isCoach = role === "coach";

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: isCoach ? "Dashboard" : "Feed", href: isCoach ? "/app/dashboard" : "/app" },
          { label: "Profile" }
        ]}
      />

      {/* Profile header with avatar */}
      <Card className="cardInteractive">
        <div className="row" style={{ gap: 20, alignItems: "center" }}>
          <Avatar name={displayName} size="xl" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{displayName}</div>
            <div className="muted" style={{ marginTop: 4 }}>{email}</div>
            <div style={{ marginTop: 8 }}>
              <Pill variant={isCoach ? "info" : "success"}>
                {role.toUpperCase()}
              </Pill>
            </div>
          </div>
        </div>
      </Card>

      {/* Edit profile */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Edit Profile</div>
          <div className="cardSubtitle">Update your display name</div>
        </div>
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 180 }}>
              <Input label="First name" name="firstName" value={firstName} onChange={setFirstName} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Input label="Last name" name="lastName" value={lastName} onChange={setLastName} />
            </div>
          </div>

          <div className="row" style={{ alignItems: "center" }}>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Danger zone */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle" style={{ color: "var(--danger)" }}>Danger Zone</div>
          <div className="cardSubtitle">Permanent account deletion</div>
        </div>
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Type <b>DELETE</b> to confirm.
            {isCoach ? " This will also delete your entire team, including all players and videos." : null}
          </div>

          <Input label="Confirmation" name="confirm" value={confirm} onChange={setConfirm} placeholder="DELETE" />

          <Button variant="danger" onClick={() => setConfirmDeleteOpen(true)} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete my account"}
          </Button>

          <Modal
            open={confirmDeleteOpen}
            title="Delete account"
            onClose={() => setConfirmDeleteOpen(false)}
            footer={
              <>
                <Button onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirmDeleteOpen(false);
                    deleteAccount();
                  }}
                  disabled={deleting || confirm.trim().toUpperCase() !== "DELETE"}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </>
            }
          >
            <div className="stack">
              <div className="muted" style={{ fontSize: 13 }}>
                {role === "coach"
                  ? "This will delete your account and your entire team (including players and videos). This cannot be undone."
                  : "This will delete your account. This cannot be undone."}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                To continue, type <b>DELETE</b> in the field on this page.
              </div>
            </div>
          </Modal>
        </div>
      </Card>
    </div>
  );
}
