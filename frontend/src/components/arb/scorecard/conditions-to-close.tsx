"use client";

import type { ArbAction } from "@/arb/types";
import styles from "./arb-scorecard-page.module.css";

export interface ConditionsToCloseProps {
  actions: ArbAction[];
}

export function ConditionsToClose({ actions }: ConditionsToCloseProps) {
  if (actions.length === 0) return null;

  return (
    <section style={{ padding: "12px 20px" }}>
      <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand)" }}>
        Conditions to Close
      </p>
      <table className={`arb-conditions-table ${styles.conditionsTable}`} role="table">
        <thead>
          <tr role="row">
            <th role="columnheader">Action</th>
            <th role="columnheader">Owner</th>
            <th role="columnheader">Due Date</th>
            <th role="columnheader">Status</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action.actionId} role="row">
              <td role="cell">{action.actionSummary}</td>
              <td role="cell">{action.owner ?? "Unassigned"}</td>
              <td role="cell">{action.dueDate ?? "No date"}</td>
              <td role="cell">{action.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
