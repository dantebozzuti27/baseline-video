"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Modal } from "@/components/ui";
import { toast } from "../../../toast";

type Enrollment = { id: string; player_user_id: string; template_id: string; start_at: string; status: string };
type Submission = {
  id: string;
  enrollment_id: string;
  week_index: number;
  day_index?: number | null;
  assignment_id?: string | null;
  assignment?: any | null;
  note: string | null;
  created_at: string;
  video_id: string;
  videos?: { id: string; title: string; category: string; owner_user_id: string; created_at: string } | null;
};
type Review = { id: string; submission_id: string; reviewed_at: string; review_note: string | null };

export default function CoachProgramFeedClient({
  enrollments,
  submissions,
  reviews,
  playerById
}: {
  enrollments: Enrollment[];
  submissions: Submission[];
  reviews: Review[];
  playerById: Record<string, string>;
}) {
  const router = useRouter();
  const [onlyNeedsReview, setOnlyNeedsReview] = React.useState(true);
  const [dialog, setDialog] = React.useState<{ submissionId: string; note: string } | null>(null);
  const [loading, setLoading] = React.useState(false);

  const enrollmentById = React.useMemo(() => {
    const m: Record<string, Enrollment> = {};
    for (const e of enrollments) m[e.id] = e;
    return m;
  }, [enrollments]);

  const reviewBySubmissionId = React.useMemo(() => {
    const m: Record<string, Review> = {};
    for (const r of reviews) m[r.submission_id] = r;
    return m;
  }, [reviews]);

  const rows = React.useMemo(() => {
    const out = (submissions ?? []).slice();
    out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return out;
  }, [submissions]);

  async function markReviewed() {
    if (!dialog) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/programs/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: dialog.submissionId, note: dialog.note.trim() || undefined })
      });
      if (resp.ok) {
        toast("Marked reviewed.");
        setDialog(null);
        router.refresh();
      }
    } catch (e) {
      console.error("mark reviewed failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 980 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Program feed</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            A separate stream of program submissions (not the normal Library).
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs">
            Templates
          </Link>
          <Link className="btn" href="/app/programs/enrollments">
            Enrollments
          </Link>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        <Card>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Filter</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                {onlyNeedsReview ? "Showing submissions that need review." : "Showing all submissions."}
              </div>
            </div>
            <Button onClick={() => setOnlyNeedsReview((v) => !v)}>{onlyNeedsReview ? "Show all" : "Needs review"}</Button>
          </div>
        </Card>

        {(rows ?? [])
          .filter((s) => {
            const reviewed = Boolean(reviewBySubmissionId[s.id]);
            return onlyNeedsReview ? !reviewed : true;
          })
          .map((s) => {
            const e = enrollmentById[s.enrollment_id];
            const reviewed = Boolean(reviewBySubmissionId[s.id]);
            const playerName = e ? playerById[e.player_user_id] : "Player";
            const videoTitle = s.videos?.title ?? "Video";
            const drillTitle = s.assignment?.drill?.title ?? null;
            const dayLabel =
              typeof s.day_index === "number" && Number.isFinite(s.day_index) ? `Day ${s.day_index}` : null;
            return (
              <Card key={s.id}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {playerName} • Week {s.week_index}
                      {dayLabel ? ` • ${dayLabel}` : ""}
                      {drillTitle ? ` • ${drillTitle}` : ""}
                      {reviewed ? <span className="pill">Reviewed</span> : <span className="pill">Needs review</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                      {videoTitle} • {String(s.videos?.category ?? "").toUpperCase()}
                    </div>
                    {s.note ? (
                      <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                        {s.note}
                      </div>
                    ) : null}
                  </div>

                  <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <Link className="btn" href={`/app/videos/${s.video_id}`}>
                      Open video
                    </Link>
                    <Button
                      variant={reviewed ? "default" : "primary"}
                      onClick={() => setDialog({ submissionId: s.id, note: "" })}
                      disabled={loading}
                    >
                      Mark reviewed
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}

        {rows.length === 0 ? (
          <Card>
            <div className="muted" style={{ fontSize: 13 }}>
              No program submissions yet.
            </div>
          </Card>
        ) : null}
      </div>

      <Modal
        open={Boolean(dialog)}
        title="Mark reviewed"
        onClose={() => (loading ? null : setDialog(null))}
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={markReviewed} disabled={loading}>
              {loading ? "Saving…" : "Mark reviewed"}
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="muted" style={{ fontSize: 13 }}>
            Optional note for the player.
          </div>
          <textarea
            className="input"
            style={{ minHeight: 120 }}
            value={dialog?.note ?? ""}
            onChange={(e) => setDialog((d) => (d ? { ...d, note: e.target.value } : d))}
            placeholder="What should they focus on next?"
          />
        </div>
      </Modal>
    </div>
  );
}


