"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Modal } from "@/components/ui";
import { toast } from "../../toast";

type Template = {
  id: string;
  title: string;
  weeks_count: number;
  cycle_days: number;
  enrollment_count: number;
};

export default function ProgramsListClient({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [deleteDialog, setDeleteDialog] = React.useState<Template | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function deleteProgram() {
    if (!deleteDialog) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/templates/${deleteDialog.id}`, { method: "DELETE" });
      if (resp.ok) {
        toast("Program deleted.");
        setDeleteDialog(null);
        router.refresh();
      }
    } catch (e) {
      console.error("delete program failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="stack" style={{ marginTop: 14 }}>
        {templates.length ? (
          templates.map((t) => (
            <Card key={t.id}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{t.title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                    {t.weeks_count} weeks • {t.cycle_days} day cycle
                    {t.enrollment_count > 0 ? ` • ${t.enrollment_count} enrolled` : ""}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Button onClick={() => setDeleteDialog(t)}>Delete</Button>
                  <Link className="btn btnPrimary" href={`/app/programs/${t.id}`}>
                    Edit
                  </Link>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <div className="stack">
              <div style={{ fontWeight: 900 }}>No programs yet</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Create a week-by-week template, then enroll players into it.
              </div>
              <div>
                <Link className="btn btnPrimary" href="/app/programs/new">
                  Create your first program
                </Link>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Program feed</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                A dedicated stream of program submissions and reviews (separate from the normal library).
              </div>
            </div>
            <Link className="btn" href="/app/programs/feed">
              Open feed
            </Link>
          </div>
        </Card>
      </div>

      <Modal
        open={deleteDialog !== null}
        title="Delete program"
        onClose={() => (loading ? null : setDeleteDialog(null))}
        footer={
          <>
            <Button onClick={() => setDeleteDialog(null)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteProgram} disabled={loading}>
              {loading ? "Deleting…" : "Delete program"}
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="muted" style={{ fontSize: 13 }}>
            Are you sure you want to delete <strong>{deleteDialog?.title}</strong>?
          </div>
          <div className="muted" style={{ fontSize: 13, color: "var(--danger)" }}>
            This will also delete all enrollments, submissions, and reviews for this program. This cannot be undone.
          </div>
        </div>
      </Modal>
    </>
  );
}

