"use client";

import type { ArbFinding, ArbAction } from "@/arb/types";
import styles from "./arb-findings-page.module.css";

export interface FindingActionEditorProps {
  finding: ArbFinding;
  action: ArbAction | null;
  onCreate: (finding: ArbFinding) => void;
  onUpdate: (action: ArbAction) => void;
  onSave: (action: ArbAction) => void;
  creating: boolean;
  saving: boolean;
}

export function FindingActionEditor({
  finding,
  action,
  onCreate,
  onUpdate,
  onSave,
  creating,
  saving,
}: FindingActionEditorProps) {
  if (!action) {
    return (
      <section>
        <h3 className={styles.sectionHeading}>Remediation Action</h3>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => onCreate(finding)}
            disabled={creating}
          >
            {creating ? "Creating\u2026" : "Create Remediation Action"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 className={styles.sectionHeading}>Remediation Action</h3>

      <div className="arb-field-grid">
        <label className="filter-field">
          <span>Action status</span>
          <select
            className="field-select"
            value={action.status}
            onChange={(e) =>
              onUpdate({ ...action, status: e.target.value })
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
            value={action.owner ?? ""}
            onChange={(e) =>
              onUpdate({ ...action, owner: e.target.value || null })
            }
          />
        </label>

        <label className="filter-field">
          <span>Due date</span>
          <input
            className="field-input"
            type="date"
            value={action.dueDate ?? ""}
            onChange={(e) =>
              onUpdate({ ...action, dueDate: e.target.value || null })
            }
          />
        </label>
      </div>

      <label className="filter-field">
        <span>Closure notes</span>
        <textarea
          className="field-textarea"
          value={action.closureNotes ?? ""}
          onChange={(e) =>
            onUpdate({ ...action, closureNotes: e.target.value || null })
          }
        />
      </label>

      <label className="arb-inline-check">
        <input
          type="checkbox"
          checked={action.reviewerVerificationRequired}
          onChange={(e) =>
            onUpdate({
              ...action,
              reviewerVerificationRequired: e.target.checked,
            })
          }
        />
        <span>Reviewer verification required</span>
      </label>

      <div className="button-row">
        <button
          type="button"
          className="primary-button"
          onClick={() => onSave(action)}
          disabled={saving}
        >
          {saving ? "Saving\u2026" : "Save action"}
        </button>
      </div>
    </section>
  );
}
