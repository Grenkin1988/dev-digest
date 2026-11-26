/* CategoryDonut — ring of finding counts per category with a legend. Plain SVG
   (the shared Donut formats values as dollars; these are counts). */
import React from "react";
import { buildArcs } from "./helpers";

const SIZE = 130;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CategoryDonut({ items, label }: { items: { category: string; count: number }[]; label: string }) {
  const arcs = buildArcs(items, CIRCUMFERENCE);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={SIZE} height={SIZE} role="img" aria-label={label} style={{ transform: "rotate(-90deg)" }}>
        {arcs.map((a) => (
          <circle
            key={a.category}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={a.color}
            strokeWidth={STROKE}
            strokeDasharray={`${a.length} ${CIRCUMFERENCE - a.length}`}
            strokeDashoffset={-a.start}
          />
        ))}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {arcs.map((a) => (
          <div key={a.category} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: a.color }} />
            <span style={{ color: "var(--text-secondary)", flex: 1 }}>{a.category}</span>
            <span className="mono tnum" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {a.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
