"use client";

import { useId } from "react";

export function Sparkline({
  values,
  color = "var(--brand)",
  label,
}: {
  values: number[];
  color?: string;
  label?: string;
}) {
  const id = useId();

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 80;
  const H = 28;
  const PAD = 2;

  const pts = values
    .map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const fillPts = `${PAD},${H} ${pts} ${W - PAD},${H}`;
  const gradId = `sg-${id}`.replace(/[^a-z0-9-]/gi, "");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      aria-label={label}
      role="img"
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill={`url(#${gradId})`} stroke="none" points={fillPts} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}
