"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Modal, Pill, Select } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "../toast";
import { Copy, Link, UserPlus, Trash2 } from "lucide-react";

type Player = {
  user_id: string;
  display_name: string;
  is_active?: boolean;
  claimed_at?: string | null;
  claim_token?: string | null;
};

function siteOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}

export default function RosterCard({ players }: { players: Player[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{ userId: string; nextActive: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = React.useState<Player | null>(null);

  // Add player modal
  const [addOpen, setAddOpen] = React.useState(false);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [playerMode, setPlayerMode] = React.useState("in_person");
  const [creating, setCreating] = React.useState(false);
  const [newClaimUrl, setNewClaimUrl] = React.useState<string | null>(null);

  async function setActive(userId: string, active: boolean) {
    setConfirm({ userId, nextActive: active });
  }

  async function doSetActive() {
    if (!confirm) return;
    const userId = confirm.userId;
    const active = confirm.nextActive;
    setLoadingId(userId);
    try {
      const resp = await fetch("/api/team/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, active })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error ?? "Unable to update player");
      toast(active ? "Player reactivated." : "Player deactivated.");
      router.refresh();
    } catch (e: any) {
      console.error("update player active failed", e);
    } finally {
      setLoadingId(null);
      setConfirm(null);
    }
  }

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;

    setCreating(true);
    try {
      const resp = await fetch("/api/team/players/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), playerMode })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Unable to create player");

      setNewClaimUrl(`${siteOrigin()}${json.claimUrl}`);
      toast("Player created!");
      router.refresh();
    } catch (e: any) {
      console.error("create player failed", e);
    } finally {
      setCreating(false);
    }
  }

  function resetAddModal() {
    setAddOpen(false);
    setFirstName("");
    setLastName("");
    setPlayerMode("in_person");
    setNewClaimUrl(null);
  }

  async function copyClaimLink(token: string) {
    const url = `${siteOrigin()}/claim/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Claim link copied!");
    } catch {
      // fallback
    }
  }

  async function regenerateLink(userId: string) {
    setLoadingId(userId);
    try {
      const resp = await fetch(`/api/team/players/${userId}/claim`, { method: "POST" });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Unable to regenerate");
      toast("New claim link generated!");
      router.refresh();
    } catch (e: any) {
      console.error("regenerate failed", e);
    } finally {
      setLoadingId(null);
    }
  }

  async function deleteUnclaimed() {
    if (!deleteConfirm) return;
    setLoadingId(deleteConfirm.user_id);
    try {
      const resp = await fetch(`/api/team/players/${deleteConfirm.user_id}/claim`, { method: "DELETE" });
      if (!resp.ok) throw new Error("Unable to delete");
      toast("Player removed.");
      router.refresh();
    } catch (e: any) {
      console.error("delete failed", e);
    } finally {
      setLoadingId(null);
      setDeleteConfirm(null);
    }
  }

  const claimedPlayers = players.filter((p) => p.claimed_at);
  const unclaimedPlayers = players.filter((p) => !p.claimed_at && p.claim_token);

  return (
    <Card>
      <div className="stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 900 }}>Roster</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {players.length} players on your team
            </div>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus size={16} />
            Add player
          </Button>
        </div>

        {/* Unclaimed players */}
        {unclaimedPlayers.length > 0 && (
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="label">Pending (waiting to claim)</div>
            <div className="stack">
              {unclaimedPlayers.map((p) => {
                const isWorking = loadingId === p.user_id;
                return (
                  <div key={p.user_id} className="card" style={{ padding: 12 }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div className="row" style={{ alignItems: "center", gap: 12 }}>
                        <Avatar name={p.display_name} size="md" />
                        <div>
                          <div style={{ fontWeight: 800 }}>{p.display_name}</div>
                          <Pill variant="warning">Pending</Pill>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <Button onClick={() => copyClaimLink(p.claim_token!)} disabled={isWorking}>
                          <Copy size={14} />
                          Copy link
                        </Button>
                        <Button onClick={() => regenerateLink(p.user_id)} disabled={isWorking}>
                          <Link size={14} />
                        </Button>
                        <Button variant="danger" onClick={() => setDeleteConfirm(p)} disabled={isWorking}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Claimed players */}
        {claimedPlayers.length > 0 ? (
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="label">Active players</div>
            <div className="stack bvStagger">
              {claimedPlayers.map((p) => {
                const active = p.is_active !== false;
                const isWorking = loadingId === p.user_id;
                return (
                  <div key={p.user_id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="row" style={{ alignItems: "center", gap: 12 }}>
                      <Avatar name={p.display_name} size="md" />
                      <div>
                        <div style={{ fontWeight: 800 }}>{p.display_name}</div>
                        <Pill variant={active ? "success" : "muted"}>
                          {active ? "Active" : "Inactive"}
                        </Pill>
                      </div>
                    </div>
                    <Button
                      variant={active ? "danger" : "primary"}
                      disabled={isWorking}
                      onClick={() => setActive(p.user_id, !active)}
                    >
                      {isWorking ? "Working…" : active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : claimedPlayers.length === 0 && unclaimedPlayers.length === 0 ? (
          <EmptyState
            variant="roster"
            title="No players yet"
            message="Add a player or share your invite link."
            actionLabel="Add player"
            onAction={() => setAddOpen(true)}
          />
        ) : null}

        {/* Confirm deactivate modal */}
        <Modal
          open={Boolean(confirm)}
          title={confirm?.nextActive ? "Reactivate player" : "Deactivate player"}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)} disabled={Boolean(loadingId)}>
                Cancel
              </Button>
              <Button
                variant={confirm?.nextActive ? "primary" : "danger"}
                onClick={doSetActive}
                disabled={Boolean(loadingId)}
              >
                {confirm?.nextActive ? "Reactivate" : "Deactivate"}
              </Button>
            </>
          }
        >
          <div className="muted" style={{ fontSize: 13 }}>
            {confirm?.nextActive ? "This player will regain access to the app." : "This player won't be able to access the app."}
          </div>
        </Modal>

        {/* Delete unclaimed modal */}
        <Modal
          open={Boolean(deleteConfirm)}
          title="Delete player"
          onClose={() => setDeleteConfirm(null)}
          footer={
            <>
              <Button onClick={() => setDeleteConfirm(null)} disabled={Boolean(loadingId)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={deleteUnclaimed} disabled={Boolean(loadingId)}>
                Delete
              </Button>
            </>
          }
        >
          <div className="muted" style={{ fontSize: 13 }}>
            Remove {deleteConfirm?.display_name} from your roster? They haven't claimed their account yet.
          </div>
        </Modal>

        {/* Add player modal */}
        <Modal
          open={addOpen}
          title={newClaimUrl ? "Player created!" : "Add player"}
          onClose={resetAddModal}
          footer={
            newClaimUrl ? (
              <Button variant="primary" onClick={resetAddModal}>
                Done
              </Button>
            ) : (
              <>
                <Button onClick={resetAddModal} disabled={creating}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => createPlayer({ preventDefault: () => {} } as React.FormEvent)} disabled={creating || !firstName.trim() || !lastName.trim()}>
                  {creating ? "Creating..." : "Create player"}
                </Button>
              </>
            )
          }
        >
          {newClaimUrl ? (
            <div className="stack" style={{ gap: 16 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                Share this link with {firstName} to let them claim their account:
              </div>
              <div className="card" style={{ padding: 12, wordBreak: "break-all", fontWeight: 600, fontSize: 13 }}>
                {newClaimUrl}
              </div>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(newClaimUrl);
                    toast("Link copied!");
                  } catch {}
                }}
              >
                <Copy size={14} />
                Copy claim link
              </Button>
            </div>
          ) : (
            <form className="stack" style={{ gap: 16 }} onSubmit={createPlayer}>
              <div className="muted" style={{ fontSize: 13 }}>
                Create a player account and get a link they can use to claim it.
              </div>
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Input label="First name" name="firstName" value={firstName} onChange={setFirstName} />
                </div>
                <div style={{ flex: 1 }}>
                  <Input label="Last name" name="lastName" value={lastName} onChange={setLastName} />
                </div>
              </div>
              <Select
                label="Player type"
                name="playerMode"
                value={playerMode}
                onChange={setPlayerMode}
                options={[
                  { value: "in_person", label: "In-person" },
                  { value: "hybrid", label: "Hybrid" },
                  { value: "remote", label: "Remote" }
                ]}
              />
            </form>
          )}
        </Modal>
      </div>
    </Card>
  );
}
