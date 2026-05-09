"use client";

export interface NextActionsSectionProps {
  nextActions: string[];
}

export function NextActionsSection({ nextActions }: NextActionsSectionProps) {
  if (nextActions.length === 0) return null;

  return (
    <section style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
      <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand)" }}>
        Next Actions
      </p>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {nextActions.map((action, i) => (
          <li key={i} style={{ lineHeight: 1.6, color: "var(--t1)" }}>
            {action}
          </li>
        ))}
      </ol>
    </section>
  );
}
