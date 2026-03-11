import React, { useState } from "react";

const ALL_AFFILIATIONS = ["Children's", "TCCN", "Wellstar", "Piedmont"];
const DEFAULT_AFFILIATIONS = ["Children's", "TCCN"];

const s = {
  section: { padding: "14px 14px 10px", borderBottom: "1px solid #e2e8f0" },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: "#718096", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 },
  label: { fontSize: 12, color: "#4a5568", marginBottom: 3, display: "block" },
  input: { width: "100%", padding: "5px 8px", border: "1px solid #cbd5e0", borderRadius: 5, fontSize: 13, boxSizing: "border-box" },
  btn: { width: "100%", padding: "7px 0", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500 },
  chip: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600 },
};

function StatusChip({ status }) {
  if (status.running) {
    return (
      <div style={{ fontSize: 12, color: "#2b6cb0", lineHeight: 1.5 }}>
        <strong>Running…</strong>
        <div style={{ color: "#718096", marginTop: 2 }}>{status.step}</div>
      </div>
    );
  }
  if (status.done) {
    const d = status.last_run ? new Date(status.last_run).toLocaleString() : "";
    return (
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>
        <span style={{ ...s.chip, background: "#f0fff4", color: "#276749" }}>Ready</span>
        <div style={{ color: "#4a5568", marginTop: 4 }}>
          {status.tract_count.toLocaleString()} tracts · {status.practice_count} practices geocoded
        </div>
        {status.practice_count === 0 && (
          <div style={{ color: "#c05621", marginTop: 2, fontSize: 11 }}>
            ⚠ No geocoded practices found — geocode practices first
          </div>
        )}
        {d && <div style={{ color: "#a0aec0", fontSize: 11 }}>{d}</div>}
      </div>
    );
  }
  return (
    <div style={{ fontSize: 12, color: "#92400e" }}>
      <span style={{ ...s.chip, background: "#fffbeb", color: "#92400e" }}>Not run</span>
      {status.practice_count > 0 && (
        <div style={{ color: "#a0aec0", marginTop: 4 }}>
          {status.practice_count} practices currently geocoded
        </div>
      )}
    </div>
  );
}

function AffiliationCheckboxes({ selected, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {ALL_AFFILIATIONS.map((aff) => (
        <label key={aff} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "#4a5568" }}>
          <input
            type="checkbox"
            checked={selected.includes(aff)}
            onChange={() => {
              if (selected.includes(aff)) {
                onChange(selected.filter((a) => a !== aff));
              } else {
                onChange([...selected, aff]);
              }
            }}
            style={{ accentColor: "#00A94F", cursor: "pointer" }}
          />
          {aff}
        </label>
      ))}
    </div>
  );
}

export default function AnalyticsControls({
  status, mode, onModeChange, onRunPrecompute, onUpdateCoverage, onFindGaps, loading,
  showHighways, onToggleHighways,
}) {
  const [coverageAffiliations, setCoverageAffiliations] = useState(DEFAULT_AFFILIATIONS);
  const [gapAffiliations, setGapAffiliations] = useState(DEFAULT_AFFILIATIONS);
  const [minUnder18, setMinUnder18] = useState(1000);
  const [maxMinutes, setMaxMinutes] = useState(20);

  const pct = status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0;

  return (
    <div>
      {/* Precompute */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Precompute</div>
        <StatusChip status={status} />
        {status.running && (
          <div style={{ marginTop: 8 }}>
            <div style={{ background: "#e2e8f0", borderRadius: 4, overflow: "hidden", height: 6 }}>
              <div style={{ background: "#00A94F", width: `${pct}%`, height: "100%", transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 11, color: "#718096", marginTop: 3 }}>{pct}%</div>
          </div>
        )}
        <button
          style={{ ...s.btn, marginTop: 10, background: status.running ? "#e2e8f0" : "#00A94F", color: status.running ? "#718096" : "#fff" }}
          onClick={onRunPrecompute}
          disabled={status.running}
        >
          {status.done ? "Re-run precompute" : "Run precompute"}
        </button>
        {!status.done && !status.running && (
          <p style={{ fontSize: 11, color: "#a0aec0", marginTop: 6, lineHeight: 1.4 }}>
            Run once to compute drive distances from all ~1,200 Atlanta MSA census tract centroids to every practice.
          </p>
        )}
      </div>

      {/* Analysis selector */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Analysis</div>
        {["coverage", "gaps"].map((m) => (
          <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#2d3748", marginBottom: 6 }}>
            <input
              type="radio"
              name="analysis-mode"
              value={m}
              checked={mode === m}
              onChange={() => onModeChange(m)}
              style={{ accentColor: "#00A94F", cursor: "pointer" }}
            />
            {m === "coverage" ? "Coverage heat map" : "Gap finder"}
          </label>
        ))}
      </div>

      {/* Coverage controls */}
      {mode === "coverage" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Coverage by affiliation</div>
          <AffiliationCheckboxes selected={coverageAffiliations} onChange={setCoverageAffiliations} />
          <button
            style={{ ...s.btn, marginTop: 10, background: loading ? "#e2e8f0" : "#3182ce", color: loading ? "#718096" : "#fff", opacity: loading ? 0.7 : 1 }}
            onClick={() => onUpdateCoverage(coverageAffiliations)}
            disabled={loading}
          >
            {loading ? "Loading…" : "Update map"}
          </button>
        </div>
      )}

      {/* Gap finder controls */}
      {mode === "gaps" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Coverage by affiliation</div>
          <AffiliationCheckboxes selected={gapAffiliations} onChange={setGapAffiliations} />
          <div style={{ marginTop: 12 }}>
            <label style={s.label}>Min children under 18</label>
            <input
              style={s.input}
              type="number"
              min="0"
              step="100"
              value={minUnder18}
              onChange={(e) => setMinUnder18(Number(e.target.value))}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={s.label}>Max drive time to nearest practice (min)</label>
            <input
              style={s.input}
              type="number"
              min="0"
              step="5"
              value={maxMinutes}
              onChange={(e) => setMaxMinutes(Number(e.target.value))}
            />
          </div>
          <button
            style={{ ...s.btn, marginTop: 12, background: loading ? "#e2e8f0" : "#e53e3e", color: loading ? "#718096" : "#fff", opacity: loading ? 0.7 : 1 }}
            onClick={() => onFindGaps({ affiliations: gapAffiliations, min_under_18: minUnder18, max_minutes: maxMinutes })}
            disabled={loading}
          >
            {loading ? "Loading…" : "Find gaps"}
          </button>
        </div>
      )}

      {/* Map options */}
      <div style={{ ...s.section, borderBottom: "none" }}>
        <div style={s.sectionTitle}>Map options</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", fontSize: 12, color: "#4a5568" }}>
          <input
            type="checkbox"
            checked={showHighways ?? false}
            onChange={onToggleHighways}
            style={{ accentColor: "#f59e0b", width: 13, height: 13, cursor: "pointer" }}
          />
          Highlight freeways &amp; major highways
        </label>
      </div>
    </div>
  );
}
