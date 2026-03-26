import React from "react";

const LEGEND = [
  { label: "≤ 10 min", color: "#1a9641" },
  { label: "10–15 min", color: "#a6d96a" },
  { label: "15–20 min", color: "#ffffbf" },
  { label: "20–30 min", color: "#fdae61" },
  { label: "≥ 30 min", color: "#d7191c" },
  { label: "No data", color: "#cccccc" },
];

export default function AnalyticsResults() {
  return (
    <div style={{ padding: "14px 14px 10px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#718096", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
        Drive time legend
      </div>
      {LEGEND.map(({ label, color }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: 20, height: 14, borderRadius: 2, background: color, flexShrink: 0, border: "1px solid rgba(0,0,0,0.1)" }} />
          <span style={{ fontSize: 12, color: "#4a5568" }}>{label}</span>
        </div>
      ))}
      <p style={{ fontSize: 11, color: "#a0aec0", marginTop: 10, lineHeight: 1.5 }}>
        Colors show drive time from each census tract centroid to the nearest practice of the selected affiliation(s).
      </p>
    </div>
  );
}
