import React, { useState, useMemo } from "react";

const COLS = [
  { key: "geoid",         label: "Tract",              fmt: formatGeoid },
  { key: "_pop_source",    label: "Pop by Age Census Table",  fmt: () => "B01001", static: true },
  { key: "_inc_source",    label: "HH Income Census Table",   fmt: () => "B19013", static: true },
  { key: "ratio",         label: "Overlap",            fmt: (v) => `${Math.round(v * 100)}%`, width: 55 },
  { key: "total",         label: "Total",              fmt: (v) => v.toLocaleString(), width: 55 },
  { key: "under_5",       label: "<5",                 fmt: (v) => v.toLocaleString(), width: 55 },
  { key: "age_5_9",       label: "5–9",                fmt: (v) => v.toLocaleString(), width: 55 },
  { key: "age_10_14",     label: "10–14",              fmt: (v) => v.toLocaleString(), width: 55 },
  { key: "age_15_17",     label: "15–17",              fmt: (v) => v.toLocaleString(), width: 55 },
  { key: "income_median", label: "Med Income",         fmt: (v) => v != null ? `$${v.toLocaleString()}` : "—" },
];

// Format 11-digit GEOID as "SSCCC · TT.TT"
// e.g. "13089010100" → "13089 · 101.00"
function formatGeoid(geoid) {
  if (!geoid || geoid.length < 11) return geoid ?? "";
  const county   = geoid.slice(0, 5);
  const tractNum = (parseInt(geoid.slice(5), 10) / 100).toFixed(2);
  return `${county} · ${tractNum}`;
}

export default function TractDetailsPanel({ tracts }) {
  const [sort, setSort] = useState({ col: "total", dir: "desc" });

  const sorted = useMemo(() => {
    if (!tracts) return [];
    const { col, dir } = sort;
    return [...tracts].sort((a, b) => {
      const av = a[col] ?? (col === "geoid" ? "" : -Infinity);
      const bv = b[col] ?? (col === "geoid" ? "" : -Infinity);
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return dir === "asc" ? cmp : -cmp;
    });
  }, [tracts, sort]);

  const toggleSort = (col) => {
    if (COLS.find(c => c.key === col)?.static) return;
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" }
    );
  };

  if (!tracts || tracts.length === 0) {
    return <div style={s.empty}>No tract data available.</div>;
  }

  return (
    <div style={s.wrap}>
      <table style={s.table}>
        <thead>
          <tr>
            {COLS.map((col) => (
              <th
                key={col.key}
                style={{
                  ...s.th,
                  background: sort.col === col.key ? "#edf2f7" : "#f7fafc",
                  cursor: col.static ? "default" : "pointer",
                  ...(col.width ? { width: col.width, minWidth: col.width } : {}),
                }}
                onClick={() => toggleSort(col.key)}
              >
                {col.label}
                {sort.col === col.key && (
                  <span style={s.arrow}>{sort.dir === "asc" ? " ↑" : " ↓"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.geoid} style={s.tr}>
              {COLS.map((col) => (
                <td key={col.key} style={{ ...s.td, ...(col.width ? { width: col.width, minWidth: col.width } : {}) }}>
                  {col.fmt(t[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const s = {
  wrap: {
    flex: 1,
    overflowY: "auto",
    overflowX: "auto",
  },
  empty: {
    padding: 20,
    fontSize: 13,
    color: "#a0aec0",
    textAlign: "center",
  },
  table: {
    borderCollapse: "collapse",
    fontSize: 11,
  },
  th: {
    padding: "6px 8px",
    fontWeight: 600,
    fontSize: 11,
    color: "#4a5568",
    textAlign: "left",
    borderBottom: "2px solid #e2e8f0",
    borderRight: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    zIndex: 1,
    whiteSpace: "normal",
    maxWidth: 80,
    lineHeight: 1.3,
    verticalAlign: "bottom",
    height: 48,
    userSelect: "none",
  },
  tr: {
    borderBottom: "1px solid #edf2f7",
  },
  td: {
    padding: "4px 8px",
    borderRight: "1px solid #f0f4f8",
    whiteSpace: "nowrap",
    fontFamily: "monospace",
  },
  arrow: { color: "#4299e1" },
};
