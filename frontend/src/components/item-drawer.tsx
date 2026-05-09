"use client";

import { useEffect, useState } from "react";
import type { ChecklistItem, PackageDecision, ReviewDraft } from "@/types";

const PACKAGE_DECISIONS: PackageDecision[] = [
  "Needs Review",
  "Include",
  "Not Applicable",
  "Exclude"
];
const PACKAGE_DECISION_LABELS: Record<PackageDecision, string> = {
  "Needs Review": "Needs review",
  Include: "Include in review",
  "Not Applicable": "Not applicable",
  Exclude: "Exclude from review"
};

type ItemDrawerProps = {
  item: ChecklistItem;
  review: ReviewDraft;
  onClose: () => void;
  onUpdate: (next: Partial<ReviewDraft>) => void;
  activePackageName?: string | null;
};

export function ItemDrawer({ item, review, onClose, onUpdate, activePackageName }: ItemDrawerProps) {
  const [evidenceInput, setEvidenceInput] = useState(review.evidenceLinks.join("\n"));

  useEffect(() => {
    setEvidenceInput(review.evidenceLinks.join("\n"));
  }, [review.evidenceLinks]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel"
        onClick={(event) => event.stopPropagation()}
        aria-label="Checklist item details"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Finding detail</p>
            <h2 className="drawer-title">{item.text}</h2>
            <div className="drawer-meta">
              {item.id ? <span className="pill">{item.id}</span> : null}
              <span className="pill">{item.technology}</span>
              <span className="pill">{item.technologyStatus}</span>
              {item.severity ? <span className="pill">{item.severity}</span> : null}
              {item.waf ? <span className="pill">{item.waf}</span> : null}
            </div>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        {item.description ? (
          <section className="drawer-section">
            <h3>Recommendation</h3>
            <p className="note">{item.description}</p>
          </section>
        ) : null}

        <section className="drawer-section">
          <h3>Classification</h3>
          <div className="key-value-grid">
            <div>
              <strong>Category</strong>
              <span>{item.category ?? "Unavailable"}</span>
            </div>
            <div>
              <strong>Subcategory</strong>
              <span>{item.subcategory ?? "Unavailable"}</span>
            </div>
            <div>
              <strong>Service</strong>
              <span>{item.serviceCanonical ?? item.service ?? "Unavailable"}</span>
            </div>
            <div>
              <strong>ARM service</strong>
              <span>{item.armService ?? "Unavailable"}</span>
            </div>
            {item.service && item.serviceCanonical && item.service !== item.serviceCanonical ? (
              <div>
                <strong>Source service label</strong>
                <span>{item.service}</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="drawer-section">
          <h3>Project notes</h3>
          <p className="microcopy">
            {activePackageName
              ? `Edit the project decision for ${activePackageName} here. These notes stay scoped to the active project review in this browser and can be exported from the project review workspace.`
              : "Edit your review decision here. It stays in this browser and can be included in local exports from the project review workspace."}
          </p>
          <div className="filter-grid">
            <label>
              <span className="microcopy">Project action</span>
              <select
                className="field-select"
                value={review.packageDecision ?? "Needs Review"}
                onChange={(event) =>
                  onUpdate({ packageDecision: event.target.value as PackageDecision })
                }
              >
                {PACKAGE_DECISIONS.map((state) => (
                  <option key={state} value={state}>
                    {PACKAGE_DECISION_LABELS[state]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="microcopy">Owner</span>
              <input
                className="field-input"
                value={review.owner}
                onChange={(event) => onUpdate({ owner: event.target.value })}
                placeholder="Optional owner or reviewer"
              />
            </label>

            <label>
              <span className="microcopy">Due date</span>
              <input
                className="field-input"
                type="date"
                value={review.dueDate}
                onChange={(event) => onUpdate({ dueDate: event.target.value })}
              />
            </label>

            <label>
              <span className="microcopy">Comments</span>
              <textarea
                className="field-textarea"
                value={review.comments}
                onChange={(event) => onUpdate({ comments: event.target.value })}
                placeholder="Capture review reasoning, evidence summary, or next steps."
              />
            </label>

            <label>
              <span className="microcopy">Evidence links</span>
              <textarea
                className="field-textarea"
                value={evidenceInput}
                onChange={(event) => {
                  const nextValue = event.target.value;

                  setEvidenceInput(nextValue);
                  onUpdate({
                    evidenceLinks: nextValue
                      .split("\n")
                      .map((entry) => entry.trim())
                      .filter(Boolean)
                  });
                }}
                placeholder="One link per line"
              />
            </label>
          </div>
        </section>

        <section className="drawer-section">
          <h3>References and queries</h3>
          <div className="definition-grid">
            <div>
              <strong>Documentation</strong>
              {item.link ? (
                <a href={item.link} target="_blank" rel="noreferrer" className="muted-link">
                  Open source guidance
                </a>
              ) : (
                <span>Unavailable</span>
              )}
            </div>
            <div>
              <strong>Training</strong>
              {item.training ? (
                <a href={item.training} target="_blank" rel="noreferrer" className="muted-link">
                  Open training
                </a>
              ) : (
                <span>Unavailable</span>
              )}
            </div>
          </div>
          {item.query ? (
            <div className="drawer-section">
              <h3>Query</h3>
              <pre className="note">{item.query}</pre>
            </div>
          ) : null}
          {item.graph && item.graph !== item.query ? (
            <div className="drawer-section">
              <h3>Graph / ARG</h3>
              <pre className="note">{item.graph}</pre>
            </div>
          ) : null}
        </section>

        <section className="drawer-section">
          <h3>Traceability</h3>
          <div className="trace-grid">
            <div className="trace-card">
              <strong>Source file</strong>
              <p>{item.sourcePath ?? "Unavailable"}</p>
            </div>
            <div className="trace-card">
              <strong>Repository source</strong>
              {item.sourceUrl ? (
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="muted-link">
                  Open source file
                </a>
              ) : (
                <p>Unavailable</p>
              )}
            </div>
            <div className="trace-card">
              <strong>Normalization timestamp</strong>
              <p>{item.normalizedAt ?? "Unavailable"}</p>
            </div>
            <div className="trace-card">
              <strong>Field provenance</strong>
              <p>
                {Object.entries(item.provenance ?? {})
                  .map(([field, provenance]) => `${field}: ${provenance}`)
                  .join(", ") || "Unavailable"}
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
