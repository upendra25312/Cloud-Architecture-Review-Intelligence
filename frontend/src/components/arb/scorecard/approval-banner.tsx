"use client";

export interface ApprovalBannerProps {
  decision: string;
  reviewerName?: string | null;
  approvedAt?: string | null;
  rationale?: string | null;
}

function formatApprovalDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const DECISION_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string; label: string }> = {
  Approved: {
    icon: "✓",
    color: "#14532D",
    bg: "#F0FDF4",
    border: "#16A34A",
    label: "Architecture Approved",
  },
  "Conditionally Approved": {
    icon: "✓",
    color: "#78350F",
    bg: "#FFFBEB",
    border: "#D97706",
    label: "Conditionally Approved",
  },
  "Needs Revision": {
    icon: "↻",
    color: "#1E3A5F",
    bg: "#EFF6FF",
    border: "#2563EB",
    label: "Revision Requested",
  },
  "Needs Remediation": {
    icon: "!",
    color: "#7F1D1D",
    bg: "#FEF2F2",
    border: "#DC2626",
    label: "Remediation Required",
  },
};

export function ApprovalBanner({ decision, reviewerName, approvedAt, rationale }: ApprovalBannerProps) {
  const config = DECISION_CONFIG[decision] ?? {
    icon: "·",
    color: "#374151",
    bg: "#F9FAFB",
    border: "#9CA3AF",
    label: decision,
  };

  const dateStr = formatApprovalDate(approvedAt);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        padding: "16px 20px",
        background: config.bg,
        borderLeft: `4px solid ${config.border}`,
        borderBottom: "1px solid var(--border)",
      }}
      role="status"
      aria-label={`Review decision: ${config.label}`}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: config.border,
          color: "#fff",
          fontSize: "1.25rem",
          fontWeight: 800,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {config.icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: "1rem", color: config.color }}>
          {config.label}
        </p>
        {(reviewerName || dateStr) && (
          <p style={{ margin: "0 0 4px", fontSize: "0.85rem", color: config.color, opacity: 0.8 }}>
            {[reviewerName, dateStr].filter(Boolean).join(" · ")}
          </p>
        )}
        {rationale && (
          <p style={{ margin: 0, fontSize: "0.9rem", color: config.color, opacity: 0.75, fontStyle: "italic" }}>
            "{rationale}"
          </p>
        )}
      </div>
    </div>
  );
}
