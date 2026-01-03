"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Modal, Select } from "@/components/ui";
import { toast } from "../../../toast";

type Focus = { id: string; name: string; description: string | null; cues: string[] };
type Drill = {
  id: string;
  title: string;
  category: "hitting" | "throwing" | "fielding" | "other";
  goal: string | null;
  equipment: string[];
  cues: string[];
  mistakes: string[];
};
type Media = {
  id: string;
  drill_id: string;
  kind: "internal_video" | "external_link";
  video_id: string | null;
  external_url: string | null;
  title: string | null;
  sort_order: number;
};

function linesToList(s: string) {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function listToLines(arr: any[]) {
  return (Array.isArray(arr) ? arr : []).map((x) => String(x ?? "").trim()).filter(Boolean).join("\n");
}

function parseInternalVideoId(input: string) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  // Accept raw uuid or /videos/:id style links
  const re = new RegExp("videos/([0-9a-f-]{20,})", "i");
  const m = s.match(re);
  if (m?.[1]) return m[1];
  return s;
}

export default function LibraryClient({ focuses, drills, media }: { focuses: Focus[]; drills: Drill[]; media: Media[] }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"drills" | "focuses">("drills");
  const [loading, setLoading] = React.useState(false);

  // Focus create
  const [focusOpen, setFocusOpen] = React.useState(false);
  const [focusName, setFocusName] = React.useState("");
  const [focusDesc, setFocusDesc] = React.useState("");
  const [focusCues, setFocusCues] = React.useState("");

  // Drill create
  const [drillOpen, setDrillOpen] = React.useState(false);
  const [drillTitle, setDrillTitle] = React.useState("");
  const [drillCategory, setDrillCategory] = React.useState<Drill["category"]>("hitting");
  const [drillGoal, setDrillGoal] = React.useState("");
  const [drillEquipment, setDrillEquipment] = React.useState("");
  const [drillCues, setDrillCues] = React.useState("");
  const [drillMistakes, setDrillMistakes] = React.useState("");

  // Media add
  const [mediaOpen, setMediaOpen] = React.useState<{ drillId: string } | null>(null);
  const [mediaKind, setMediaKind] = React.useState<Media["kind"]>("external_link");
  const [mediaTitle, setMediaTitle] = React.useState("");
  const [mediaUrl, setMediaUrl] = React.useState("");
  const [mediaVideo, setMediaVideo] = React.useState("");

  // Edit focus
  const [editFocus, setEditFocus] = React.useState<Focus | null>(null);
  const [editFocusName, setEditFocusName] = React.useState("");
  const [editFocusDesc, setEditFocusDesc] = React.useState("");
  const [editFocusCues, setEditFocusCues] = React.useState("");

  // Delete focus
  const [deleteFocusId, setDeleteFocusId] = React.useState<string | null>(null);

  // Edit drill
  const [editDrill, setEditDrill] = React.useState<Drill | null>(null);
  const [editDrillTitle, setEditDrillTitle] = React.useState("");
  const [editDrillCategory, setEditDrillCategory] = React.useState<Drill["category"]>("hitting");
  const [editDrillGoal, setEditDrillGoal] = React.useState("");
  const [editDrillEquipment, setEditDrillEquipment] = React.useState("");
  const [editDrillCues, setEditDrillCues] = React.useState("");
  const [editDrillMistakes, setEditDrillMistakes] = React.useState("");

  // Delete drill
  const [deleteDrillId, setDeleteDrillId] = React.useState<string | null>(null);

  // Delete media
  const [deleteMediaId, setDeleteMediaId] = React.useState<string | null>(null);

  const mediaByDrillId = React.useMemo(() => {
    const m: Record<string, Media[]> = {};
    for (const x of media ?? []) {
      if (!m[x.drill_id]) m[x.drill_id] = [];
      m[x.drill_id].push(x);
    }
    return m;
  }, [media]);

  async function createFocus() {
    setLoading(true);
    try {
      const resp = await fetch("/api/programs/focuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: focusName,
          description: focusDesc.trim() || undefined,
          cues: linesToList(focusCues)
        })
      });
      if (resp.ok) toast("Focus created.");
      setFocusOpen(false);
      setFocusName("");
      setFocusDesc("");
      setFocusCues("");
      router.refresh();
    } catch (e) {
      console.error("create focus failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function createDrill() {
    setLoading(true);
    try {
      const resp = await fetch("/api/programs/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: drillTitle,
          category: drillCategory,
          goal: drillGoal.trim() || undefined,
          equipment: linesToList(drillEquipment),
          cues: linesToList(drillCues),
          mistakes: linesToList(drillMistakes)
        })
      });
      if (resp.ok) toast("Drill created.");
      setDrillOpen(false);
      setDrillTitle("");
      setDrillGoal("");
      setDrillEquipment("");
      setDrillCues("");
      setDrillMistakes("");
      router.refresh();
    } catch (e) {
      console.error("create drill failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function addMedia() {
    if (!mediaOpen) return;
    setLoading(true);
    try {
      const payload =
        mediaKind === "external_link"
          ? { drillId: mediaOpen.drillId, kind: mediaKind, externalUrl: mediaUrl.trim(), title: mediaTitle.trim() || undefined }
          : { drillId: mediaOpen.drillId, kind: mediaKind, videoId: parseInternalVideoId(mediaVideo), title: mediaTitle.trim() || undefined };

      const resp = await fetch("/api/programs/drills/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (resp.ok) toast("Instruction added.");
      setMediaOpen(null);
      setMediaTitle("");
      setMediaUrl("");
      setMediaVideo("");
      router.refresh();
    } catch (e) {
      console.error("add media failed", e);
    } finally {
      setLoading(false);
    }
  }

  function openEditFocus(f: Focus) {
    setEditFocus(f);
    setEditFocusName(f.name);
    setEditFocusDesc(f.description ?? "");
    setEditFocusCues(listToLines(f.cues));
  }

  async function saveFocus() {
    if (!editFocus) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/focuses/${editFocus.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editFocusName,
          description: editFocusDesc.trim() || null,
          cues: linesToList(editFocusCues)
        })
      });
      if (resp.ok) toast("Focus updated.");
      setEditFocus(null);
      router.refresh();
    } catch (e) {
      console.error("save focus failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeleteFocus() {
    if (!deleteFocusId) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/focuses/${deleteFocusId}`, { method: "DELETE" });
      if (resp.ok) toast("Focus deleted.");
      setDeleteFocusId(null);
      router.refresh();
    } catch (e) {
      console.error("delete focus failed", e);
    } finally {
      setLoading(false);
    }
  }

  function openEditDrill(d: Drill) {
    setEditDrill(d);
    setEditDrillTitle(d.title);
    setEditDrillCategory(d.category);
    setEditDrillGoal(d.goal ?? "");
    setEditDrillEquipment(listToLines(d.equipment));
    setEditDrillCues(listToLines(d.cues));
    setEditDrillMistakes(listToLines(d.mistakes));
  }

  async function saveDrill() {
    if (!editDrill) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/drills/${editDrill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDrillTitle,
          category: editDrillCategory,
          goal: editDrillGoal.trim() || null,
          equipment: linesToList(editDrillEquipment),
          cues: linesToList(editDrillCues),
          mistakes: linesToList(editDrillMistakes)
        })
      });
      if (resp.ok) toast("Drill updated.");
      setEditDrill(null);
      router.refresh();
    } catch (e) {
      console.error("save drill failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeleteDrill() {
    if (!deleteDrillId) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/drills/${deleteDrillId}`, { method: "DELETE" });
      if (resp.ok) {
        toast("Drill deleted.");
        setDeleteDrillId(null);
        router.refresh();
      }
    } catch (e) {
      console.error("delete drill failed", e);
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeleteMedia() {
    if (!deleteMediaId) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/programs/drills/media/${deleteMediaId}`, { method: "DELETE" });
      if (resp.ok) toast("Instruction removed.");
      setDeleteMediaId(null);
      router.refresh();
    } catch (e) {
      console.error("delete media failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 980 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Program library</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Build reusable drills with instruction videos/links, and focuses you can assign to days.
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs">
            Templates
          </Link>
          <Link className="btn" href="/app/programs/feed">
            Feed
          </Link>
        </div>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <Button variant={tab === "drills" ? "primary" : "default"} onClick={() => setTab("drills")}>
          Drills
        </Button>
        <Button variant={tab === "focuses" ? "primary" : "default"} onClick={() => setTab("focuses")}>
          Focuses
        </Button>
        <div style={{ flex: 1 }} />
        {tab === "drills" ? (
          <Button variant="primary" onClick={() => setDrillOpen(true)}>
            New drill
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setFocusOpen(true)}>
            New focus
          </Button>
        )}
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        {tab === "focuses" ? (
          (focuses ?? []).length ? (
            focuses.map((f) => (
              <Card key={f.id}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="stack" style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900 }}>{f.name}</div>
                    {f.description ? <div className="muted" style={{ fontSize: 13 }}>{f.description}</div> : null}
                    {f.cues?.length ? (
                      <div className="muted" style={{ fontSize: 13 }}>
                        Cues: {f.cues.join(" • ")}
                      </div>
                    ) : null}
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <Button onClick={() => openEditFocus(f)} disabled={loading}>Edit</Button>
                    <Button onClick={() => setDeleteFocusId(f.id)} disabled={loading}>Delete</Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card>
              <div className="muted" style={{ fontSize: 13 }}>No focuses yet.</div>
            </Card>
          )
        ) : (drills ?? []).length ? (
          drills.map((d) => {
            const m = mediaByDrillId[d.id] ?? [];
            return (
              <Card key={d.id}>
                <div className="stack">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{d.title}</div>
                      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{String(d.category).toUpperCase()}</div>
                      {d.goal ? <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{d.goal}</div> : null}
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <Button onClick={() => openEditDrill(d)} disabled={loading}>Edit</Button>
                      <Button onClick={() => setDeleteDrillId(d.id)} disabled={loading}>Delete</Button>
                      <Button onClick={() => setMediaOpen({ drillId: d.id })} disabled={loading}>Add instruction</Button>
                    </div>
                  </div>

                  {m.length ? (
                    <div className="stack" style={{ gap: 8 }}>
                      <div className="muted" style={{ fontSize: 13, fontWeight: 800 }}>Instruction</div>
                      {m.map((x) => (
                        <div key={x.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {x.title || (x.kind === "internal_video" ? "Instruction video" : "Instruction link")}
                          </div>
                          <div className="row" style={{ gap: 8 }}>
                            {x.kind === "internal_video" && x.video_id ? (
                              <Link className="btn" href={`/app/videos/${x.video_id}`}>
                                Open
                              </Link>
                            ) : x.external_url ? (
                              <a className="btn" href={x.external_url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            ) : null}
                            <Button onClick={() => setDeleteMediaId(x.id)} disabled={loading}>Remove</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 13 }}>No instruction added yet.</div>
                  )}
                </div>
              </Card>
            );
          })
        ) : (
          <Card>
            <div className="muted" style={{ fontSize: 13 }}>No drills yet.</div>
          </Card>
        )}
      </div>

      <Modal
        open={focusOpen}
        title="New focus"
        onClose={() => (loading ? null : setFocusOpen(false))}
        footer={
          <>
            <Button onClick={() => setFocusOpen(false)} disabled={loading}>Cancel</Button>
            <Button variant="primary" onClick={createFocus} disabled={loading}>Create</Button>
          </>
        }
      >
        <div className="stack">
          <Input label="Name" name="focusName" value={focusName} onChange={setFocusName} placeholder="Timing" />
          <div>
            <div className="label">Description (optional)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 90 }} value={focusDesc} onChange={(e) => setFocusDesc(e.target.value)} />
          </div>
          <div>
            <div className="label">Cues (one per line)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 120 }} value={focusCues} onChange={(e) => setFocusCues(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Modal
        open={drillOpen}
        title="New drill"
        onClose={() => (loading ? null : setDrillOpen(false))}
        footer={
          <>
            <Button onClick={() => setDrillOpen(false)} disabled={loading}>Cancel</Button>
            <Button variant="primary" onClick={createDrill} disabled={loading}>Create</Button>
          </>
        }
      >
        <div className="stack">
          <Input label="Title" name="drillTitle" value={drillTitle} onChange={setDrillTitle} placeholder="Tee work: inside pitch" />
          <Select
            label="Category"
            name="category"
            value={drillCategory}
            onChange={(v) => setDrillCategory(v as any)}
            options={[
              { value: "hitting", label: "Hitting" },
              { value: "throwing", label: "Throwing" },
              { value: "fielding", label: "Fielding" },
              { value: "other", label: "Other" }
            ]}
          />
          <div>
            <div className="label">Goal (optional)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 90 }} value={drillGoal} onChange={(e) => setDrillGoal(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="label">Equipment (one per line)</div>
              <textarea className="input" style={{ marginTop: 8, minHeight: 120 }} value={drillEquipment} onChange={(e) => setDrillEquipment(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="label">Cues (one per line)</div>
              <textarea className="input" style={{ marginTop: 8, minHeight: 120 }} value={drillCues} onChange={(e) => setDrillCues(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="label">Common mistakes (one per line)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 120 }} value={drillMistakes} onChange={(e) => setDrillMistakes(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(mediaOpen)}
        title="Add instruction"
        onClose={() => (loading ? null : setMediaOpen(null))}
        footer={
          <>
            <Button onClick={() => setMediaOpen(null)} disabled={loading}>Cancel</Button>
            <Button variant="primary" onClick={addMedia} disabled={loading}>Add</Button>
          </>
        }
      >
        <div className="stack">
          <Select
            label="Type"
            name="kind"
            value={mediaKind}
            onChange={(v) => setMediaKind(v as any)}
            options={[
              { value: "external_link", label: "External link" },
              { value: "internal_video", label: "In-app video" }
            ]}
          />
          <Input label="Title (optional)" name="mediaTitle" value={mediaTitle} onChange={setMediaTitle} placeholder="Demo" />
          {mediaKind === "external_link" ? (
            <Input label="URL" name="externalUrl" value={mediaUrl} onChange={setMediaUrl} placeholder="https://…" />
          ) : (
            <Input label="Video ID or link" name="videoId" value={mediaVideo} onChange={setMediaVideo} placeholder="/app/videos/…" />
          )}
        </div>
      </Modal>

      {/* Edit focus modal */}
      <Modal
        open={editFocus !== null}
        title="Edit focus"
        onClose={() => (loading ? null : setEditFocus(null))}
        footer={
          <>
            <Button onClick={() => setEditFocus(null)} disabled={loading}>Cancel</Button>
            <Button variant="primary" onClick={saveFocus} disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
          </>
        }
      >
        <div className="stack">
          <Input label="Name" name="focusName" value={editFocusName} onChange={setEditFocusName} />
          <div>
            <div className="label">Description (optional)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 90 }} value={editFocusDesc} onChange={(e) => setEditFocusDesc(e.target.value)} />
          </div>
          <div>
            <div className="label">Cues (one per line)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 120 }} value={editFocusCues} onChange={(e) => setEditFocusCues(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Delete focus confirmation */}
      <Modal
        open={deleteFocusId !== null}
        title="Delete focus"
        onClose={() => (loading ? null : setDeleteFocusId(null))}
        footer={
          <>
            <Button onClick={() => setDeleteFocusId(null)} disabled={loading}>Cancel</Button>
            <Button variant="danger" onClick={confirmDeleteFocus} disabled={loading}>{loading ? "Deleting…" : "Delete"}</Button>
          </>
        }
      >
        <div className="muted" style={{ fontSize: 13 }}>
          Are you sure you want to delete this focus? Days using this focus will have it cleared.
        </div>
      </Modal>

      {/* Edit drill modal */}
      <Modal
        open={editDrill !== null}
        title="Edit drill"
        onClose={() => (loading ? null : setEditDrill(null))}
        footer={
          <>
            <Button onClick={() => setEditDrill(null)} disabled={loading}>Cancel</Button>
            <Button variant="primary" onClick={saveDrill} disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
          </>
        }
      >
        <div className="stack">
          <Input label="Title" name="drillTitle" value={editDrillTitle} onChange={setEditDrillTitle} />
          <Select
            label="Category"
            name="category"
            value={editDrillCategory}
            onChange={(v) => setEditDrillCategory(v as any)}
            options={[
              { value: "hitting", label: "Hitting" },
              { value: "throwing", label: "Throwing" },
              { value: "fielding", label: "Fielding" },
              { value: "other", label: "Other" }
            ]}
          />
          <div>
            <div className="label">Goal (optional)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 90 }} value={editDrillGoal} onChange={(e) => setEditDrillGoal(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="label">Equipment (one per line)</div>
              <textarea className="input" style={{ marginTop: 8, minHeight: 120 }} value={editDrillEquipment} onChange={(e) => setEditDrillEquipment(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="label">Cues (one per line)</div>
              <textarea className="input" style={{ marginTop: 8, minHeight: 120 }} value={editDrillCues} onChange={(e) => setEditDrillCues(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="label">Common mistakes (one per line)</div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 120 }} value={editDrillMistakes} onChange={(e) => setEditDrillMistakes(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Delete drill confirmation */}
      <Modal
        open={deleteDrillId !== null}
        title="Delete drill"
        onClose={() => (loading ? null : setDeleteDrillId(null))}
        footer={
          <>
            <Button onClick={() => setDeleteDrillId(null)} disabled={loading}>Cancel</Button>
            <Button variant="danger" onClick={confirmDeleteDrill} disabled={loading}>{loading ? "Deleting…" : "Delete"}</Button>
          </>
        }
      >
        <div className="muted" style={{ fontSize: 13, color: "var(--danger)" }}>
          If this drill is used in any assignment, you must remove those assignments first.
        </div>
      </Modal>

      {/* Delete media confirmation */}
      <Modal
        open={deleteMediaId !== null}
        title="Remove instruction"
        onClose={() => (loading ? null : setDeleteMediaId(null))}
        footer={
          <>
            <Button onClick={() => setDeleteMediaId(null)} disabled={loading}>Cancel</Button>
            <Button variant="danger" onClick={confirmDeleteMedia} disabled={loading}>{loading ? "Removing…" : "Remove"}</Button>
          </>
        }
      >
        <div className="muted" style={{ fontSize: 13 }}>
          Remove this instruction from the drill?
        </div>
      </Modal>
    </div>
  );
}


