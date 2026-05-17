"use client";

export interface FindingsBulkActionBarProps {
  selectedCount: number;
  bulkStatus: string;
  bulkOwner: string;
  bulkDueDate: string;
  applying: boolean;
  onStatusChange: (v: string) => void;
  onOwnerChange: (v: string) => void;
  onDueDateChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
}

export function FindingsBulkActionBar({
  selectedCount,
  bulkStatus,
  bulkOwner,
  bulkDueDate,
  applying,
  onStatusChange,
  onOwnerChange,
  onDueDateChange,
  onApply,
  onClear,
}: FindingsBulkActionBarProps) {
  if (selectedCount === 0) return null;

  const hasAnyChange = !!bulkStatus || bulkOwner.trim() !== "" || !!bulkDueDate;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 20px",
        background: "var(--brand-dim)",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontWeight: 600,
          fontSize: "0.875rem",
          color: "var(--brand)",
          whiteSpace: "nowrap",
          minWidth: 80,
        }}
      >
        {selectedCount} selected
      </span>

      <select
        value={bulkStatus}
        onChange={(e) => onStatusChange(e.target.value)}
        aria-label="Set status for selected findings"
        style={{
          fontSize: "0.85rem",
          padding: "3px 6px",
          borderRadius: 4,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--t1)",
        }}
      >
        <option value="">— status unchanged —</option>
        <option value="Open">Open</option>
        <option value="In Progress">In Progress</option>
        <option value="Closed">Closed</option>
      </select>

      <input
        type="text"
        placeholder="Set owner…"
        value={bulkOwner}
        onChange={(e) => onOwnerChange(e.target.value)}
        aria-label="Set owner for selected findings"
        style={{
          fontSize: "0.85rem",
          padding: "3px 8px",
          borderRadius: 4,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--t1)",
          width: 160,
        }}
      />

      <input
        type="date"
        value={bulkDueDate}
        onChange={(e) => onDueDateChange(e.target.value)}
        aria-label="Set due date for selected findings"
        title="Set due date"
        style={{
          fontSize: "0.85rem",
          padding: "3px 6px",
          borderRadius: 4,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--t1)",
        }}
      />

      <button
        className="primary-button"
        onClick={onApply}
        disabled={applying || !hasAnyChange}
        style={{ fontSize: "0.85rem" }}
      >
        {applying ? "Applying…" : "Apply to selected"}
      </button>

      <button
        className="secondary-button"
        onClick={onClear}
        disabled={applying}
        style={{ fontSize: "0.85rem" }}
        aria-label="Clear selection"
      >
        ✕ Clear
      </button>
    </div>
  );
}
