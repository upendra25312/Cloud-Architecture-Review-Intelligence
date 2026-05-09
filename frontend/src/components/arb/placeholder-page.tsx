import type { ReactNode } from "react";

export function ArbPlaceholderPage(props: {
  intro: string;
  bullets: string[];
  footer?: ReactNode;
}) {
  const { intro, bullets, footer } = props;

  return (
    <div className="arb-page-stack">
      <section className="future-card arb-placeholder-card">
        <p className="section-copy">{intro}</p>
      </section>
      <section className="surface-panel arb-placeholder-card">
        <h2 className="section-title">What this step is responsible for</h2>
        <ul className="arb-checklist">
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
        </ul>
      </section>
      {footer ? <div>{footer}</div> : null}
    </div>
  );
}
