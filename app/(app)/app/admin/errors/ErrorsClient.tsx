"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Pill, Button, Modal, Select } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { formatDate } from "@/lib/utils/datetime";

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
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [resolving, setResolving] = React.useState<string | null>(null);

  const filteredErrors = errors.filter((e) => {
    if (filter === "unresolved" && e.resolved_at) return false;
    if (filter === "resolved" && !e.resolved_at) return false;
    if (typeFilter !== "all" && e.error_type !== typeFilter) return false;
    return true;
  });

  const errorTypes = Array.from(new Set(errors.map((e) => e.error_type)));

  async function resolveError(id: string) {
    setResolving(id);
    try {
      await fetch(`/api/admin/errors/${id}/resolve`, { method: "POST" });
      router.refresh();
    } catch (e) {
      console.error("Failed to resolve error", e);
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
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
        <Select
          label=""
          name="typeFilter"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[{ value: "all", label: "All Types" }, ...errorTypes.map((t) => ({ value: t, label: t }))]}
        />
        <div className="muted" style={{ fontSize: 13, alignSelf: "center" }}>
          {filteredErrors.length} error{filteredErrors.length !== 1 ? "s" : ""}
        </div>
      </div>

      {filteredErrors.length === 0 ? (
        <EmptyState variant="generic" title="No errors" message="No errors match your filters." />
      ) : (
        <div className="stack">
          {filteredErrors.map((error) => {
            const isExpanded = expanded === error.id;
            return (
              <Card key={error.id} className="cardInteractive">
                <div
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpanded(isExpanded ? null : error.id)}
                >
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <Pill variant={error.error_type === "frontend" ? "warning" : error.error_type === "api" ? "danger" : "muted"}>
                          {error.error_type}
                        </Pill>
                        {error.resolved_at ? (
                          <Pill variant="success">Resolved</Pill>
                        ) : (
                          <Pill variant="danger">Open</Pill>
                        )}
                        {error.endpoint && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            {error.endpoint}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          wordBreak: "break-word",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: isExpanded ? "unset" : 2,
                          WebkitBoxOrient: "vertical"
                        }}
                      >
                        {error.message}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {formatDate(error.created_at)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                    {error.stack && (
                      <div style={{ marginBottom: 16 }}>
                        <div className="label" style={{ marginBottom: 8 }}>
                          Stack Trace
                        </div>
                        <pre
                          style={{
                            background: "var(--bg-subtle, #111)",
                            padding: 12,
                            borderRadius: 6,
                            fontSize: 11,
                            overflow: "auto",
                            maxHeight: 200,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word"
                          }}
                        >
                          {error.stack}
                        </pre>
                      </div>
                    )}

                    {error.user_id && (
                      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                        User ID: {error.user_id}
                      </div>
                    )}

                    {Object.keys(error.metadata || {}).length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div className="label" style={{ marginBottom: 8 }}>
                          Metadata
                        </div>
                        <pre
                          style={{
                            background: "var(--bg-subtle, #111)",
                            padding: 12,
                            borderRadius: 6,
                            fontSize: 11,
                            overflow: "auto",
                            maxHeight: 150
                          }}
                        >
                          {JSON.stringify(error.metadata, null, 2)}
                        </pre>
                      </div>
                    )}

                    {!error.resolved_at && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="primary"
                          onClick={() => resolveError(error.id)}
                          disabled={resolving === error.id}
                        >
                          <CheckCircle size={14} />
                          {resolving === error.id ? "Resolving..." : "Mark Resolved"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

