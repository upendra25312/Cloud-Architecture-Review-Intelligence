"use client";

import type { ArbFinding } from "@/arb/types";
import styles from "./arb-findings-page.module.css";

export interface FindingEditorProps {
  finding: ArbFinding;
  onUpdate: (finding: ArbFinding) => void;
  onSave: (finding: ArbFinding) => void;
  saving: boolean;
  error: string | null;
}

export function FindingEditor({
  finding,
  onUpdate,
  onSave,
  saving,
  error,
}: FindingEditorProps) {
  return (
    <section>
      <h3 className={styles.sectionHeading}>Review Action</h3>

      <div className="arb-field-grid">
        <label className="filter-field">
          <span>Status</span>
          <select
            className="field-select"
            value={finding.status}
            onChange={(e) =>
              onUpdate({ ...finding, status: e.target.value })
            }
          >
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Closed">Closed</option>
          </select>
        </label>

        <label className="filter-field">
          <span>Owner</span>
          <input
            className="field-input"
            value={finding.owner ?? ""}
            placeholder={finding.suggestedOwner ?? "Assign owner"}
            onChange={(e) =>
              onUpdate({ ...finding, owner: e.target.value || null })
            }
          />
        </label>

        <label className="filter-field">
          <span>Due date</span>
          <input
            className="field-input"
            type="date"
            value={finding.dueDate ?? ""}
            onChange={(e) =>
              onUpdate({ ...finding, dueDate: e.target.value || null })
            }
          />
        </label>
      </div>

      <label className="filter-field">
        <span>Reviewer note</span>
        <textarea
          className="field-textarea"
          value={finding.reviewerNote ?? ""}
          onChange={(e) =>
            onUpdate({ ...finding, reviewerNote: e.target.value || null })
          }
        />
      </label>

      <label className="arb-inline-check">
        <input
          type="checkbox"
          checked={finding.criticalBlocker}
          onChange={(e) =>
            onUpdate({ ...finding, criticalBlocker: e.target.checked })
          }
        />
        <span>Critical blocker</span>
      </label>

      <div className="button-row">
        <button
          type="button"
          className="primary-button"
          onClick={() => onSave(finding)}
          disabled={saving}
        >
          {saving ? "Saving\u2026" : "Save finding"}
        </button>
        {error && (
          <span style={{ color: "#D92B2B", fontSize: "0.85rem" }}>
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
