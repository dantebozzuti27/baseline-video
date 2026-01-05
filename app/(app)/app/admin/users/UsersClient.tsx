"use client";

import * as React from "react";
import { Card, Pill, Modal, Select } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { Avatar } from "@/components/Avatar";
import { formatDate } from "@/lib/utils/datetime";

type User = {
  user_id: string;
  display_name: string;
  role: string;
  is_active: boolean;
  is_admin: boolean;
  player_mode: string | null;
  team_name: string;
  video_count: number;
  lesson_count: number;
  created_at: string;
};

export default function UsersClient({ users }: { users: User[] }) {
  const [roleFilter, setRoleFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<User | null>(null);

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter === "active" && !u.is_active) return false;
    if (statusFilter === "inactive" && u.is_active) return false;
    return true;
  });

  const columns = [
    {
      key: "display_name",
      header: "User",
      width: "200px",
      render: (row: User) => (
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <Avatar name={row.display_name} size="sm" />
          <span style={{ fontWeight: 600 }}>{row.display_name}</span>
        </div>
      )
    },
    {
      key: "role",
      header: "Role",
      width: "100px",
      render: (row: User) => (
        <Pill variant={row.role === "coach" ? "default" : "info"}>
          {row.role}
        </Pill>
      )
    },
    {
      key: "is_active",
      header: "Status",
      width: "100px",
      render: (row: User) => (
        <Pill variant={row.is_active ? "success" : "muted"}>
          {row.is_active ? "Active" : "Inactive"}
        </Pill>
      )
    },
    {
      key: "team_name",
      header: "Team",
      width: "150px"
    },
    {
      key: "video_count",
      header: "Videos",
      width: "80px",
      render: (row: User) => (
        <span style={{ fontWeight: 600 }}>{row.video_count}</span>
      )
    },
    {
      key: "lesson_count",
      header: "Lessons",
      width: "80px",
      render: (row: User) => (
        <span style={{ fontWeight: 600 }}>{row.lesson_count}</span>
      )
    },
    {
      key: "created_at",
      header: "Joined",
      width: "120px",
      render: (row: User) => (
        <span style={{ fontSize: 12 }}>{formatDate(row.created_at)}</span>
      )
    }
  ];

  return (
    <div className="stack">
      {/* Filters */}
      <Card>
        <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="label">Role</label>
            <Select
              label=""
              name="roleFilter"
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: "all", label: "All Roles" },
                { value: "coach", label: "Coaches" },
                { value: "player", label: "Players" }
              ]}
            />
          </div>
          <div>
            <label className="label">Status</label>
            <Select
              label=""
              name="statusFilter"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" }
              ]}
            />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <Card>
        <DataTable
          data={filteredUsers}
          columns={columns}
          pageSize={50}
          searchable={true}
          searchKeys={["display_name", "team_name", "role"]}
          exportFilename="users"
          onRowClick={setSelected}
          emptyMessage="No users match your filters"
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        open={Boolean(selected)}
        title="User Details"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="row" style={{ alignItems: "center", gap: 12 }}>
              <Avatar name={selected.display_name} size="lg" />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.display_name}</div>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <Pill variant={selected.role === "coach" ? "default" : "info"}>
                    {selected.role}
                  </Pill>
                  <Pill variant={selected.is_active ? "success" : "muted"}>
                    {selected.is_active ? "Active" : "Inactive"}
                  </Pill>
                  {selected.is_admin && <Pill variant="warning">Admin</Pill>}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div className="label">User ID</div>
                <code style={{ fontSize: 11 }}>{selected.user_id}</code>
              </div>
              <div>
                <div className="label">Team</div>
                <div style={{ marginTop: 4 }}>{selected.team_name}</div>
              </div>
              {selected.player_mode && (
                <div>
                  <div className="label">Player Mode</div>
                  <div style={{ marginTop: 4 }}>{selected.player_mode}</div>
                </div>
              )}
              <div>
                <div className="label">Joined</div>
                <div style={{ marginTop: 4 }}>{formatDate(selected.created_at, "long")}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card className="cardInteractive">
                <div className="muted" style={{ fontSize: 12 }}>Videos Uploaded</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                  {selected.video_count}
                </div>
              </Card>
              <Card className="cardInteractive">
                <div className="muted" style={{ fontSize: 12 }}>Lessons</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                  {selected.lesson_count}
                </div>
              </Card>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

