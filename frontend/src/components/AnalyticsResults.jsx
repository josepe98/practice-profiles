import React from "react";

const LEGEND = [
  { label: "≤ 10 min", color: "#1a9641" },
  { label: "10–15 min", color: "#a6d96a" },
  { label: "15–20 min", color: "#ffffbf" },
  { label: "20–30 min", color: "#fdae61" },
  { label: "≥ 30 min", color: "#d7191c" },
  { label: "No data", color: "#cccccc" },
];

// FIPS county code → name for Atlanta MSA
const COUNTY_NAMES = {
  "013": "Barrow",   "015": "Bartow",  "035": "Butts",    "045": "Carroll",
  "057": "Cherokee", "063": "Clayton", "067": "Cobb",     "077": "Coweta",
  "085": "Dawson",   "089": "DeKalb",  "097": "Douglas",  "113": "Fayette",
  "117": "Forsyth",  "121": "Fulton",  "135": "Gwinnett", "143": "Haralson",
  "149": "Heard",    "151": "Henry",   "159": "Jasper",   "171": "Lamar",
  "199": "Meriwether", "211": "Morgan", "217": "Newton",  "223": "Paulding",
  "227": "Pickens",  "231": "Pike",    "247": "Rockdale", "255": "Spalding",
  "297": "Walton",
};

function countyName(geoid) {
  const fips = geoid.substring(2, 5);
  return COUNTY_NAMES[fips] ? `${COUNTY_NAMES[fips]} County` : `County ${fips}`;
}

function fmt(n, digits = 0) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

const s = {
  section: { padding: "14px 14px 10px", borderBottom: "1px solid #e2e8f0" },
  title: { fontSize: 11, fontWeight: 700, color: "#718096", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 },
  card: {
    padding: "10px 12px", marginBottom: 8, borderRadius: 6,
    border: "1px solid #e2e8f0", background: "#fff",
    cursor: "pointer", transition: "box-shadow 0.15s",
  },
};

export default function AnalyticsResults({ mode, gaps, onSelectGap }) {
  if (mode === "coverage") {
    return (
      <div>
        <div style={s.section}>
          <div style={s.title}>Drive time legend</div>
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
      </div>
    );
  }

  // Gap finder mode
  return (
    <div>
      <div style={s.section}>
        <div style={s.title}>Gap tracts ({gaps.length})</div>
        {gaps.length === 0 && (
          <p style={{ fontSize: 12, color: "#a0aec0" }}>
            No gaps found yet. Set filters and click "Find gaps".
          </p>
        )}
        {gaps.map((gap) => {
          const isDesert = gap.any_miles == null || gap.any_miles > 5;
          return (
            <div
              key={gap.geoid}
              style={{ ...s.card, borderLeft: `3px solid ${isDesert ? "#e53e3e" : "#ed8936"}` }}
              onClick={() => onSelectGap(gap)}
              title="Click to fly to this tract"
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "#2d3748", marginBottom: 2 }}>
                Tract {gap.geoid} · {countyName(gap.geoid)}
              </div>
              <div style={{ fontSize: 11, color: "#4a5568", lineHeight: 1.6 }}>
                <div>{fmt(gap.under_18)} kids under 18</div>
                <div>
                  Nearest covered:{" "}
                  {gap.covered_minutes >= 999
                    ? "none within range"
                    : `${fmt(gap.covered_minutes, 0)} min · ${fmt(gap.covered_miles, 1)} mi`}
                </div>
                {gap.any_miles != null && (
                  <div>Nearest any practice: {fmt(gap.any_miles, 1)} mi</div>
                )}
                {gap.income_median != null && (
                  <div>Median HH income: ${fmt(gap.income_median)}</div>
                )}
                {isDesert && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#e53e3e" }}>TRUE DESERT</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
