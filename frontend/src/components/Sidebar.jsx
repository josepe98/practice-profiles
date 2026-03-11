import React from "react";
import FilterBar from "./FilterBar.jsx";
import PracticeCard from "./PracticeCard.jsx";
import SearchBar from "./SearchBar.jsx";
import PopulationPanel from "./PopulationPanel.jsx";

const styles = {
  sidebar: {
    width: 320,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderLeft: "1px solid #e2e8f0",
    background: "#fff",
    overflow: "hidden",
  },
  listHeader: {
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 600,
    color: "#4a5568",
    background: "#f7fafc",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  list: {
    flex: 1,
    overflowY: "auto",
  },
  empty: {
    padding: 20,
    fontSize: 13,
    color: "#a0aec0",
    textAlign: "center",
  },
};

export default function Sidebar({
  practices,
  originId,
  customOrigin,
  filteredResults,
  populationData,
  showTracts,
  onToggleTracts,
  overlapThreshold,
  onThresholdChange,
  loading,
  onFilter,
  onClearFilter,
  onSearchSelect,
  showHighways,
  onToggleHighways,
  showDensity,
  onToggleDensity,
}) {
  const hasFilter = filteredResults !== null;
  const displayList = hasFilter ? filteredResults : [];
  const count = hasFilter ? filteredResults.length : practices.length;
  const total = practices.length;
  const origin = practices.find((p) => p.id === originId) ?? null;
  const hasOrigin = origin != null || customOrigin != null;

  return (
    <div style={styles.sidebar}>
      <SearchBar practices={practices} onSelect={onSearchSelect} />
      <FilterBar
        originId={originId}
        customOrigin={customOrigin}
        loading={loading}
        onFilter={onFilter}
        onClearFilter={onClearFilter}
        showHighways={showHighways}
        onToggleHighways={onToggleHighways}
        showDensity={showDensity}
        onToggleDensity={onToggleDensity}
      />

      <PopulationPanel data={populationData} />
      {populationData && (
        <div style={{ padding: "6px 14px", borderBottom: "1px solid #e2e8f0", background: "#f7fafc", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onToggleTracts}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 4,
              border: `1px solid ${showTracts ? "#6b46c1" : "#cbd5e0"}`,
              background: showTracts ? "#6b46c1" : "#fff",
              color: showTracts ? "#fff" : "#4a5568",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {showTracts ? "Hide census tracts" : "Show census tracts"}
          </button>
          <select
            value={Math.round(overlapThreshold * 100)}
            onChange={(e) => onThresholdChange(parseInt(e.target.value, 10) / 100)}
            title="Minimum % of tract area inside polygon"
            style={{
              fontSize: 12,
              padding: "3px 6px",
              borderRadius: 4,
              border: "1px solid #cbd5e0",
              background: "#fff",
              color: "#4a5568",
              cursor: "pointer",
            }}
          >
            {[20, 40, 60, 80, 100].map((pct) => (
              <option key={pct} value={pct}>{pct}% overlap</option>
            ))}
          </select>
        </div>
      )}

      <div style={styles.listHeader}>
        {hasFilter
          ? `${count} practice${count !== 1 ? "s" : ""} within range (${total} total)`
          : hasOrigin
          ? `${total} practice${total !== 1 ? "s" : ""} total — set a filter to see nearby`
          : `${total} practice${total !== 1 ? "s" : ""} — click map or marker to begin`}
      </div>

      <div style={styles.list}>
        {!hasOrigin && (
          <div style={styles.empty}>
            Click a marker or anywhere on the map to set an origin.
          </div>
        )}

        {origin && <PracticeCard practice={origin} />}

        {customOrigin && !origin && (
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", fontSize: 13, color: "#4a5568" }}>
            <strong style={{ color: "#e53e3e" }}>Custom location</strong>
            <div style={{ fontSize: 11, color: "#718096", marginTop: 2 }}>
              {customOrigin.lat.toFixed(4)}, {customOrigin.lng.toFixed(4)}
            </div>
          </div>
        )}

        {hasOrigin && !hasFilter && (
          <div style={styles.empty}>
            Set a drive time or distance filter to see nearby practices.
          </div>
        )}

        {hasFilter && (
          <div style={styles.listHeader}>
            {count} practice{count !== 1 ? "s" : ""} in range
          </div>
        )}

        {hasFilter && displayList.length === 0 && (
          <div style={styles.empty}>No practices found within the specified range.</div>
        )}
        {displayList.map((p) => (
          <PracticeCard key={p.id} practice={p} small />
        ))}
      </div>
    </div>
  );
}
