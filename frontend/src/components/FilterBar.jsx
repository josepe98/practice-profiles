import React, { useState } from "react";

const base = {
  width: 80,
  padding: "5px 8px",
  borderRadius: 5,
  fontSize: 13,
};

const styles = {
  bar: {
    padding: "12px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f7fafc",
  },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  group: { display: "flex", flexDirection: "column" },
  label:         { fontSize: 12, color: "#4a5568", marginBottom: 2 },
  labelDisabled: { fontSize: 12, color: "#c0c8d0", marginBottom: 2 },
  input:         { ...base, border: "1px solid #cbd5e0", background: "#fff" },
  inputDisabled: { ...base, border: "1px solid #e2e8f0", background: "#f0f4f8", color: "#c0c8d0", cursor: "not-allowed" },
  applyBtn: {
    padding: "6px 14px",
    background: "#48bb78",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    alignSelf: "flex-end",
  },
  clearBtn: {
    padding: "6px 10px",
    background: "transparent",
    color: "#718096",
    border: "1px solid #cbd5e0",
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 12,
    alignSelf: "flex-end",
  },
};

function getSavedFilter() {
  try {
    const s = sessionStorage.getItem("pf_filter");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export default function FilterBar({ originId, customOrigin, loading, onFilter, onClearFilter, showHighways, onToggleHighways, showDensity, onToggleDensity, candidatePOIs, showCandidates, onToggleCandidates, addingCandidateMode, onToggleAddingCandidateMode, onClearCandidates, onAddCandidateByAddress, patientOriginDatasets, selectedPatientDatasetId, onSelectPatientDataset, showPatientOrigins, onTogglePatientOrigins }) {
  const saved = getSavedFilter();
  const [milesVal, setMilesVal]       = useState(saved?.maxMiles   != null ? String(saved.maxMiles)   : "");
  const [minutesVal, setMinutesVal]   = useState(saved?.maxMinutes != null ? String(saved.maxMinutes) : "10");
  const [candName, setCandName]       = useState("");
  const [candAddress, setCandAddress] = useState("");
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError]     = useState(null);
  // "miles" | "minutes" | null
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

  const handleAddByAddress = async () => {
    if (!candAddress.trim()) return;
    setCandLoading(true);
    setCandError(null);
    try {
      await onAddCandidateByAddress(candName, candAddress);
      setCandName("");
      setCandAddress("");
    } catch (err) {
      setCandError(err.message ?? "Address not found");
    } finally {
      setCandLoading(false);
    }
  };

  const milesDisabled   = activeField === "minutes";
  const minutesDisabled = activeField === "miles";
  const canApply = (originId || customOrigin) && !loading && activeField !== null;

  return (
    <div style={styles.bar}>
      <div style={styles.row}>
        <div style={styles.group}>
          <span style={milesDisabled ? styles.labelDisabled : styles.label}>Max miles</span>
          <input
            style={milesDisabled ? styles.inputDisabled : styles.input}
            type="number"
            min="0"
            step="0.5"
            placeholder="e.g. 6"
            value={milesVal}
            disabled={milesDisabled}
            onChange={handleMiles}
          />
        </div>
        <div style={styles.group}>
          <span style={minutesDisabled ? styles.labelDisabled : styles.label}>Max drive min</span>
          <input
            style={minutesDisabled ? styles.inputDisabled : styles.input}
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 15"
            value={minutesVal}
            disabled={minutesDisabled}
            onChange={handleMinutes}
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
        <button style={styles.clearBtn} onClick={handleClear}>
          Clear
        </button>
      </div>
      {!originId && !customOrigin && (
        <p style={{ marginTop: 6, fontSize: 12, color: "#a0aec0" }}>
          Select a practice or click the map to set an origin.
        </p>
      )}
      {(patientOriginDatasets?.length ?? 0) > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#718096", marginBottom: 4 }}>Patient origins by zip code</div>
          <select
            value={selectedPatientDatasetId ?? ""}
            onChange={(e) => onSelectPatientDataset(e.target.value ? Number(e.target.value) : null)}
            style={{ width: "100%", boxSizing: "border-box", padding: "4px 7px", fontSize: 12, borderRadius: 4, border: "1px solid #cbd5e0", marginBottom: 4 }}
          >
            <option value="">— none —</option>
            {patientOriginDatasets.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.practice_name})</option>
            ))}
          </select>
          {selectedPatientDatasetId && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={showPatientOrigins ?? true}
                onChange={onTogglePatientOrigins}
                style={{ accentColor: "#bd0026", width: 13, height: 13, cursor: "pointer" }}
              />
              <span style={{ fontSize: 12, color: "#4a5568" }}>Show layer</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                {["#f7fcf5","#c7e9c0","#74c476","#238b45","#00441b"].map((c, i) => (
                  <span key={i} style={{ width: 12, height: 12, background: c.startsWith("#") ? c : `#${c}`, display: "inline-block", borderRadius: 1 }} />
                ))}
                <span style={{ fontSize: 10, color: "#718096", marginLeft: 3 }}>low → high</span>
              </span>
            </label>
          )}
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, cursor: "pointer", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={showHighways ?? false}
          onChange={onToggleHighways}
          style={{ accentColor: "#f59e0b", width: 13, height: 13, cursor: "pointer" }}
        />
        <span style={{ fontSize: 12, color: "#4a5568" }}>Highlight freeways & major highways</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={showDensity ?? false}
          onChange={onToggleDensity}
          style={{ accentColor: "#3182ce", width: 13, height: 13, cursor: "pointer" }}
        />
        <span style={{ fontSize: 12, color: "#4a5568" }}>Show pediatric population density</span>
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          onClick={onToggleAddingCandidateMode}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 4,
            border: `1px solid ${addingCandidateMode ? "#c05621" : "#cbd5e0"}`,
            background: addingCandidateMode ? "#c05621" : "#fff",
            color: addingCandidateMode ? "#fff" : "#4a5568",
            cursor: "pointer",
          }}
        >
          {addingCandidateMode ? "Click map to place… (cancel)" : "Drop candidate pin"}
        </button>
        {(candidatePOIs?.length ?? 0) > 0 && (
          <button
            onClick={onClearCandidates}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid #cbd5e0",
              background: "#fff",
              color: "#e53e3e",
              cursor: "pointer",
            }}
          >
            Clear all
          </button>
        )}
      </div>
      {(candidatePOIs?.length ?? 0) > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            checked={showCandidates ?? true}
            onChange={onToggleCandidates}
            style={{ accentColor: "#d69e2e", width: 13, height: 13, cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, color: "#4a5568" }}>
            Show candidate locations ({candidatePOIs.length})
          </span>
        </label>
      )}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#718096", marginBottom: 5 }}>Add candidate by address</div>
        <input
          placeholder="Name (optional)"
          value={candName}
          onChange={(e) => setCandName(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "4px 7px", fontSize: 12, borderRadius: 4, border: "1px solid #cbd5e0", marginBottom: 4 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <input
            placeholder="Address or place"
            value={candAddress}
            onChange={(e) => { setCandAddress(e.target.value); setCandError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddByAddress(); }}
            style={{ flex: 1, padding: "4px 7px", fontSize: 12, borderRadius: 4, border: `1px solid ${candError ? "#e53e3e" : "#cbd5e0"}` }}
          />
          <button
            onClick={handleAddByAddress}
            disabled={candLoading || !candAddress.trim()}
            style={{
              padding: "4px 10px", fontSize: 12, fontWeight: 500,
              borderRadius: 4, border: "none",
              background: candLoading || !candAddress.trim() ? "#cbd5e0" : "#d69e2e",
              color: "#fff", cursor: candLoading || !candAddress.trim() ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            {candLoading ? "…" : "Add"}
          </button>
        </div>
        {candError && <div style={{ fontSize: 11, color: "#e53e3e", marginTop: 3 }}>{candError}</div>}
      </div>
    </div>
  );
}
