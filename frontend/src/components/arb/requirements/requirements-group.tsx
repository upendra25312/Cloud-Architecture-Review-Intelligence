"use client";

import { useState } from "react";
import type { ArbRequirement } from "@/arb/types";
import { RequirementCard } from "./requirement-card";
import styles from "./arb-requirements-page.module.css";

export interface RequirementsGroupProps {
  groupName: string;
  requirements: ArbRequirement[];
  defaultExpanded: boolean;
}

export function RequirementsGroup({
  groupName,
  requirements,
  defaultExpanded,
}: RequirementsGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={styles.groupSection}>
      <button
        type="button"
        className={styles.groupHeader}
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className={`${styles.chevron}${expanded ? ` ${styles.chevronExpanded}` : ""}`}>
          ▶
        </span>
        <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
          {groupName} ({requirements.length})
        </span>
      </button>

      {expanded && (
        <div className={styles.cardGrid}>
          {requirements.map((item) => (
            <RequirementCard
              key={item.requirementId}
              requirement={item}
            />
          ))}
        </div>
      )}
    </div>
  );
}
