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
            No geocoded practices found — geocode practices first
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
  status, demoStatus, onRunPrecompute, onRefreshDemographics,
  onUpdateCoverage, loading, showHighways, onToggleHighways,
}) {
  const [coverageAffiliations, setCoverageAffiliations] = useState(DEFAULT_AFFILIATIONS);

  const demoPct = (demoStatus?.total > 0)
    ? Math.round(((demoStatus?.progress ?? 0) / demoStatus.total) * 100)
    : 0;

  return (
    <div>
      {/* Demographics refresh (Census API — free) */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Census Demographics</div>
        {demoStatus?.running ? (
          <div style={{ fontSize: 12, color: "#2b6cb0", lineHeight: 1.5 }}>
            <strong>Running…</strong>
            <div style={{ color: "#718096", marginTop: 2 }}>{demoStatus.step}</div>
            <div style={{ background: "#e2e8f0", borderRadius: 4, overflow: "hidden", height: 6, marginTop: 6 }}>
              <div style={{ background: "#00A94F", width: `${demoPct}%`, height: "100%", transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 11, color: "#718096", marginTop: 3 }}>{demoPct}%</div>
          </div>
        ) : demoStatus?.done ? (
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <span style={{ ...s.chip, background: "#f0fff4", color: "#276749" }}>Ready</span>
            <div style={{ color: "#4a5568", marginTop: 4 }}>
              {(demoStatus.tract_count || 0).toLocaleString()} tracts loaded
            </div>
            {demoStatus.last_run && (
              <div style={{ color: "#a0aec0", fontSize: 11 }}>
                {new Date(demoStatus.last_run).toLocaleString()}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#92400e" }}>
            <span style={{ ...s.chip, background: "#fffbeb", color: "#92400e" }}>Not run</span>
          </div>
        )}
        <button
          style={{ ...s.btn, marginTop: 10, background: demoStatus?.running ? "#e2e8f0" : "#00A94F", color: demoStatus?.running ? "#718096" : "#fff" }}
          onClick={onRefreshDemographics}
          disabled={demoStatus?.running}
        >
          {demoStatus?.done ? "Re-fetch demographics" : "Fetch demographics"}
        </button>
        <p style={{ fontSize: 11, color: "#a0aec0", marginTop: 6, lineHeight: 1.4, marginBottom: 0 }}>
          Fetches tract boundaries and ACS population data from the Census Bureau. Free, no API costs.
        </p>
      </div>

      {/* Drive-time distances (disabled) */}
      <div style={{ ...s.section, background: "#f7fafc", opacity: 0.7 }}>
        <div style={s.sectionTitle}>Drive-time Distances</div>
        <StatusChip status={status} />
        <button
          style={{ ...s.btn, marginTop: 10, background: "#e2e8f0", color: "#a0aec0", cursor: "not-allowed" }}
          disabled
        >
          Recompute distances
        </button>
        <p style={{ fontSize: 11, color: "#a0aec0", marginTop: 6, lineHeight: 1.4, marginBottom: 0 }}>
          Disabled while this tool is shared — recomputing distances uses OSRM/Mapbox and can be expensive at scale. Existing distance data is still used for coverage maps and gap analysis below.
        </p>
      </div>

      {/* Coverage controls */}
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
