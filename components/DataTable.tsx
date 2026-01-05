"use client";

import * as React from "react";
import { Button } from "./ui";
import { Download, ChevronLeft, ChevronRight, Search } from "lucide-react";

type Column<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
};

type Props<T> = {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  searchable?: boolean;
  searchKeys?: (keyof T)[];
  exportFilename?: string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
};

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  pageSize = 25,
  searchable = true,
  searchKeys,
  exportFilename = "export",
  onRowClick,
  emptyMessage = "No data"
}: Props<T>) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  // Filter data by search
  const filteredData = React.useMemo(() => {
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    const keys = searchKeys || columns.map((c) => c.key);
    return data.filter((row) =>
      keys.some((key) => {
        const val = row[key as keyof T];
        if (val == null) return false;
        return String(val).toLowerCase().includes(term);
      })
    );
  }, [data, search, searchKeys, columns]);

  // Sort data
  const sortedData = React.useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const pagedData = sortedData.slice(page * pageSize, (page + 1) * pageSize);

  // Export to CSV
  function exportCSV() {
    const headers = columns.map((c) => c.header);
    const rows = sortedData.map((row) =>
      columns.map((col) => {
        const val = row[col.key as keyof T];
        if (val == null) return "";
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      })
    );

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportFilename}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Toolbar */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {searchable && (
          <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)"
              }}
            />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="input"
              style={{ paddingLeft: 36 }}
            />
          </div>
        )}
        <div className="row" style={{ gap: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {sortedData.length} row{sortedData.length !== 1 ? "s" : ""}
          </span>
          <Button onClick={exportCSV}>
            <Download size={14} />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table className="bvDataTable">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  style={{ width: col.width, cursor: col.sortable !== false ? "pointer" : "default" }}
                  onClick={() => col.sortable !== false && handleSort(String(col.key))}
                >
                  {col.header}
                  {sortKey === col.key && (
                    <span style={{ marginLeft: 4, opacity: 0.5 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: "center", padding: 32 }}>
                  <span className="muted">{emptyMessage}</span>
                </td>
              </tr>
            ) : (
              pagedData.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(row)}
                  style={{ cursor: onRowClick ? "pointer" : "default" }}
                >
                  {columns.map((col) => (
                    <td key={String(col.key)}>
                      {col.render ? col.render(row) : (row[col.key as keyof T] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="row" style={{ justifyContent: "center", alignItems: "center", gap: 12 }}>
          <Button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
            <ChevronLeft size={16} />
          </Button>
          <span style={{ fontSize: 13 }}>
            Page {page + 1} of {totalPages}
          </span>
          <Button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}

