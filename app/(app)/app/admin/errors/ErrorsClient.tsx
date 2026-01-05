"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Pill, Button, Modal, Select } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { formatDate } from "@/lib/utils/datetime";
import { CheckCircle, X, ExternalLink } from "lucide-react";

type ErrorLog = {
  id: string;
  error_type: string;
  message: string;
  stack: string | null;
  user_id: string | null;
  endpoint: string | null;
  metadata: Record<string, any>;
  resolved_at: string | null;
  created_at: string;
};

export default function ErrorsClient({ errors }: { errors: ErrorLog[] }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<"all" | "unresolved" | "resolved">("unresolved");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<ErrorLog | null>(null);
  const [resolving, setResolving] = React.useState(false);

  const filteredErrors = errors.filter((e) => {
    if (filter === "unresolved" && e.resolved_at) return false;
    if (filter === "resolved" && !e.resolved_at) return false;
    if (typeFilter !== "all" && e.error_type !== typeFilter) return false;
    return true;
  });

  const errorTypes = Array.from(new Set(errors.map((e) => e.error_type)));

  async function resolveError(id: string) {
    setResolving(true);
    try {
      await fetch(`/api/admin/errors/${id}/resolve`, { method: "POST" });
      router.refresh();
      setSelected(null);
    } catch (e) {
      console.error("Failed to resolve error", e);
    } finally {
      setResolving(false);
    }
  }

  const columns = [
    {
      key: "created_at",
      header: "Time",
      width: "140px",
      render: (row: ErrorLog) => (
        <span style={{ fontSize: 12 }}>{formatDate(row.created_at)}</span>
      )
    },
    {
      key: "error_type",
      header: "Type",
      width: "100px",
      render: (row: ErrorLog) => (
        <Pill
          variant={
            row.error_type === "frontend"
              ? "warning"
              : row.error_type === "api"
              ? "danger"
              : "muted"
          }
        >
          {row.error_type}
        </Pill>
      )
    },
    {
      key: "resolved_at",
      header: "Status",
      width: "100px",
      render: (row: ErrorLog) =>
        row.resolved_at ? (
          <Pill variant="success">Resolved</Pill>
        ) : (
          <Pill variant="danger">Open</Pill>
        )
    },
    {
      key: "endpoint",
      header: "Endpoint",
      width: "180px",
      render: (row: ErrorLog) => (
        <code style={{ fontSize: 11 }}>{row.endpoint || "—"}</code>
      )
    },
    {
      key: "message",
      header: "Message",
      render: (row: ErrorLog) => (
        <span style={{ maxWidth: 300, display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
          {row.message}
        </span>
      )
    },
    {
      key: "user_id",
      header: "User",
      width: "120px",
      render: (row: ErrorLog) =>
        row.user_id ? (
          <code style={{ fontSize: 10 }}>{row.user_id.slice(0, 8)}...</code>
        ) : (
          <span className="muted">—</span>
        )
    }
  ];

  return (
    <div className="stack">
      {/* Filters */}
      <Card>
        <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="label">Status</label>
            <Select
              label=""
              name="filter"
              value={filter}
              onChange={(v) => setFilter(v as any)}
              options={[
                { value: "unresolved", label: "Unresolved" },
                { value: "resolved", label: "Resolved" },
                { value: "all", label: "All" }
              ]}
            />
          </div>
          <div>
            <label className="label">Type</label>
            <Select
              label=""
              name="typeFilter"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: "All Types" },
                ...errorTypes.map((t) => ({ value: t, label: t }))
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <Card>
        <DataTable
          data={filteredErrors}
          columns={columns}
          pageSize={50}
          searchable={true}
          searchKeys={["message", "endpoint", "error_type", "user_id"]}
          exportFilename="error-logs"
          onRowClick={setSelected}
          emptyMessage="No errors match your filters"
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        open={Boolean(selected)}
        title="Error Details"
        onClose={() => setSelected(null)}
        footer={
          selected && !selected.resolved_at ? (
            <div className="row" style={{ gap: 8 }}>
              <Button onClick={() => setSelected(null)}>Close</Button>
              <Button
                variant="primary"
                onClick={() => resolveError(selected.id)}
                disabled={resolving}
              >
                <CheckCircle size={14} />
                {resolving ? "Resolving..." : "Mark Resolved"}
              </Button>
            </div>
          ) : (
            <Button onClick={() => setSelected(null)}>Close</Button>
          )
        }
      >
        {selected && (
          <div className="stack" style={{ gap: 16 }}>
            {/* Summary */}
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Pill
                variant={
                  selected.error_type === "frontend"
                    ? "warning"
                    : selected.error_type === "api"
                    ? "danger"
                    : "muted"
                }
              >
                {selected.error_type}
              </Pill>
              {selected.resolved_at ? (
                <Pill variant="success">Resolved</Pill>
              ) : (
                <Pill variant="danger">Open</Pill>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                {formatDate(selected.created_at, "long")}
              </span>
            </div>

            {/* Message */}
            <div>
              <div className="label">Message</div>
              <div style={{ fontWeight: 600, marginTop: 4, wordBreak: "break-word" }}>
                {selected.message}
              </div>
            </div>

            {/* Endpoint */}
            {selected.endpoint && (
              <div>
                <div className="label">Endpoint</div>
                <code style={{ fontSize: 13 }}>{selected.endpoint}</code>
              </div>
            )}

            {/* User ID */}
            {selected.user_id && (
              <div>
                <div className="label">User ID</div>
                <code style={{ fontSize: 12 }}>{selected.user_id}</code>
              </div>
            )}

            {/* Stack Trace */}
            {selected.stack && (
              <div>
                <div className="label">Stack Trace</div>
                <pre
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 11,
                    overflow: "auto",
                    maxHeight: 200,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    marginTop: 8
                  }}
                >
                  {selected.stack}
                </pre>
              </div>
            )}

            {/* Metadata */}
            {Object.keys(selected.metadata || {}).length > 0 && (
              <div>
                <div className="label">Metadata</div>
                <pre
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 11,
                    overflow: "auto",
                    maxHeight: 150,
                    marginTop: 8
                  }}
                >
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
