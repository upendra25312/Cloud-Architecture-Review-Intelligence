"use client";

import styles from "./arb-scorecard-page.module.css";

export interface StrengthsSectionProps {
  strengths: string[];
}

export function StrengthsSection({ strengths }: StrengthsSectionProps) {
  if (strengths.length === 0) return null;

  const displayed = strengths.slice(0, 5);

  return (
    <section className={styles.strengthsSection}>
      <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#107C10" }}>
        Strengths
      </p>
      {displayed.map((s, i) => (
        <div key={i} className={styles.strengthItem}>
          <span aria-hidden="true">✓</span>
          <span>{s}</span>
        </div>
      ))}
    </section>
  );
}
