"use client";

import * as React from "react";
import { Card, Pill, Modal, Select } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { formatDate } from "@/lib/utils/datetime";

type Event = {
  id: string;
  event_type: string;
  user_id: string | null;
  user_name: string;
  metadata: Record<string, any>;
  created_at: string;
};

export default function EventsClient({ events }: { events: Event[] }) {
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<Event | null>(null);

  const eventTypes = Array.from(new Set(events.map((e) => e.event_type))).sort();

  const filteredEvents = events.filter((e) => {
    if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
    return true;
  });

  const columns = [
    {
      key: "created_at",
      header: "Time",
      width: "150px",
      render: (row: Event) => (
        <span style={{ fontSize: 12 }}>{formatDate(row.created_at)}</span>
      )
    },
    {
      key: "event_type",
      header: "Event",
      width: "180px",
      render: (row: Event) => {
        // Color-code different event types
        let variant: "default" | "success" | "warning" | "info" | "muted" = "muted";
        if (row.event_type.includes("signup")) variant = "success";
        else if (row.event_type.includes("upload")) variant = "info";
        else if (row.event_type.includes("lesson")) variant = "default";
        else if (row.event_type.includes("program")) variant = "warning";
        return <Pill variant={variant}>{row.event_type}</Pill>;
      }
    },
    {
      key: "user_name",
      header: "User",
      width: "150px",
      render: (row: Event) => (
        <span>{row.user_name}</span>
      )
    },
    {
      key: "user_id",
      header: "User ID",
      width: "120px",
      render: (row: Event) =>
        row.user_id ? (
          <code style={{ fontSize: 10 }}>{row.user_id.slice(0, 8)}...</code>
        ) : (
          <span className="muted">—</span>
        )
    },
    {
      key: "metadata",
      header: "Details",
      render: (row: Event) => {
        const keys = Object.keys(row.metadata || {});
        if (keys.length === 0) return <span className="muted">—</span>;
        return (
          <span style={{ fontSize: 11 }}>
            {keys.slice(0, 2).map((k) => `${k}: ${JSON.stringify(row.metadata[k])}`).join(", ")}
            {keys.length > 2 && ` +${keys.length - 2} more`}
          </span>
        );
      }
    }
  ];

  return (
    <div className="stack">
      {/* Filters */}
      <Card>
        <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="label">Event Type</label>
            <Select
              label=""
              name="typeFilter"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: "All Types" },
                ...eventTypes.map((t) => ({ value: t, label: t }))
              ]}
            />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <Card>
        <DataTable
          data={filteredEvents}
          columns={columns}
          pageSize={50}
          searchable={true}
          searchKeys={["event_type", "user_name", "user_id"]}
          exportFilename="events-log"
          onRowClick={setSelected}
          emptyMessage="No events match your filters"
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        open={Boolean(selected)}
        title="Event Details"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Pill variant="default">{selected.event_type}</Pill>
              <span className="muted" style={{ fontSize: 12 }}>
                {formatDate(selected.created_at, "long")}
              </span>
            </div>

            <div>
              <div className="label">User</div>
              <div style={{ marginTop: 4 }}>{selected.user_name}</div>
              {selected.user_id && (
                <code style={{ fontSize: 11, display: "block", marginTop: 4 }}>
                  {selected.user_id}
                </code>
              )}
            </div>

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
                    maxHeight: 200,
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

