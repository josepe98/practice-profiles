import React, { useState } from "react";

const base = { width: 80, padding: "5px 8px", borderRadius: 5, fontSize: 13 };

const styles = {
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  group: { display: "flex", flexDirection: "column" },
  label:         { fontSize: 12, color: "#4a5568", marginBottom: 2 },
  labelDisabled: { fontSize: 12, color: "#c0c8d0", marginBottom: 2 },
  input:         { ...base, border: "1px solid #cbd5e0", background: "#fff" },
  inputDisabled: { ...base, border: "1px solid #e2e8f0", background: "#f0f4f8", color: "#c0c8d0", cursor: "not-allowed" },
  applyBtn: {
    padding: "6px 14px", background: "#48bb78", color: "#fff",
    border: "none", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: 500, alignSelf: "flex-end",
  },
  clearBtn: {
    padding: "6px 10px", background: "transparent", color: "#718096",
    border: "1px solid #cbd5e0", borderRadius: 5, cursor: "pointer", fontSize: 12, alignSelf: "flex-end",
  },
};

function getSavedFilter() {
  try { const s = sessionStorage.getItem("pf_filter"); return s ? JSON.parse(s) : null; } catch { return null; }
}

export default function FilterBar({ originId, customOrigin, loading, onFilter, onClearFilter }) {
  const saved = getSavedFilter();
  const [milesVal, setMilesVal]     = useState(saved?.maxMiles   != null ? String(saved.maxMiles)   : "");
  const [minutesVal, setMinutesVal] = useState(saved?.maxMinutes != null ? String(saved.maxMinutes) : "10");
  const [activeField, setActiveField] = useState(
    saved?.maxMiles != null ? "miles" : saved?.maxMinutes != null ? "minutes" : "minutes"
  );

  const handleMiles = (e) => {
    const v = e.target.value;
    setMilesVal(v);
    setActiveField(v !== "" ? "miles" : null);
    if (v !== "") setMinutesVal("");
  };

  const handleMinutes = (e) => {
    const v = e.target.value;
    setMinutesVal(v);
    setActiveField(v !== "" ? "minutes" : null);
    if (v !== "") setMilesVal("");
  };

  const handleClear = () => {
    setMilesVal("");
    setMinutesVal("");
    setActiveField(null);
    sessionStorage.removeItem("pf_filter");
    onClearFilter();
  };

  const milesDisabled   = activeField === "minutes";
  const minutesDisabled = activeField === "miles";
  const canApply = (originId || customOrigin) && !loading && activeField !== null;

  return (
    <div>
      <div style={styles.row}>
        <div style={styles.group}>
          <span style={milesDisabled ? styles.labelDisabled : styles.label}>Max miles</span>
          <input
            style={milesDisabled ? styles.inputDisabled : styles.input}
            type="number" min="0" step="0.5" placeholder="e.g. 6"
            value={milesVal} disabled={milesDisabled} onChange={handleMiles}
          />
        </div>
        <div style={styles.group}>
          <span style={minutesDisabled ? styles.labelDisabled : styles.label}>Max drive min</span>
          <input
            style={minutesDisabled ? styles.inputDisabled : styles.input}
            type="number" min="0" step="1" placeholder="e.g. 15"
            value={minutesVal} disabled={minutesDisabled} onChange={handleMinutes}
          />
        </div>
        <button
          style={{ ...styles.applyBtn, opacity: canApply ? 1 : 0.5 }}
          onClick={() => {
            const filter = {
              maxMiles:   milesVal   !== "" ? parseFloat(milesVal)   : null,
              maxMinutes: minutesVal !== "" ? parseFloat(minutesVal) : null,
            };
            sessionStorage.setItem("pf_filter", JSON.stringify(filter));
            onFilter(filter);
          }}
          disabled={!canApply}
        >
          {loading ? "Loading…" : "Apply"}
        </button>
        <button style={styles.clearBtn} onClick={handleClear}>Clear</button>
      </div>
      {!originId && !customOrigin && (
        <p style={{ marginTop: 6, fontSize: 12, color: "#a0aec0", marginBottom: 0 }}>
          Click a marker or the map to set an origin.
        </p>
      )}
    </div>
  );
}
