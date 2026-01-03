"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Modal } from "@/components/ui";

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
  const [saveMsg, setSaveMsg] = React.useState<string | null>(null);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);

  const [confirm, setConfirm] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [deleteErr, setDeleteErr] = React.useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  async function save() {
    setSaving(true);
    setSaveErr(null);
    setSaveMsg(null);

    try {
      const resp = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to save");
      setSaveMsg("Saved.");
      setTimeout(() => setSaveMsg(null), 2000);
      router.refresh();
    } catch (e: any) {
      setSaveErr(e?.message ?? "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    setDeleteErr(null);

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
      setDeleteErr(e?.message ?? "Unable to delete account");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Profile</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Manage your name and account.
        </div>
      </div>

      <Card>
        <div className="stack">
          <div className="muted" style={{ fontSize: 13 }}>
            Signed in as <b>{email}</b> ({String(role).toUpperCase()})
          </div>

          <div className="row">
            <div style={{ flex: 1, minWidth: 180 }}>
              <Input label="First name" name="firstName" value={firstName} onChange={setFirstName} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Input label="Last name" name="lastName" value={lastName} onChange={setLastName} />
            </div>
          </div>

          {saveErr ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{saveErr}</div> : null}
          {saveMsg ? <div style={{ color: "var(--primary)", fontSize: 13 }}>{saveMsg}</div> : null}

          <div className="row" style={{ alignItems: "center" }}>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="stack">
          <div style={{ fontWeight: 900 }}>Delete account</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Type <b>DELETE</b> to confirm.
            {role === "coach" ? " This will also delete your entire team." : null}
          </div>

          <Input label="Confirmation" name="confirm" value={confirm} onChange={setConfirm} placeholder="DELETE" />

          {deleteErr ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{deleteErr}</div> : null}

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
