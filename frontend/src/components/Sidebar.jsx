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
  filteredResults,
  populationData,
  loading,
  onFilter,
  onClearFilter,
  onSearchSelect,
}) {
  const hasFilter = filteredResults !== null;
  const displayList = hasFilter ? filteredResults : [];
  const count = hasFilter ? filteredResults.length : practices.length;
  const total = practices.length;
  const origin = practices.find((p) => p.id === originId) ?? null;

  return (
    <div style={styles.sidebar}>
      <SearchBar practices={practices} onSelect={onSearchSelect} />
      <FilterBar
        originId={originId}
        loading={loading}
        onFilter={onFilter}
        onClearFilter={onClearFilter}
      />

      <PopulationPanel data={populationData} />

      <div style={styles.listHeader}>
        {hasFilter
          ? `${count} practice${count !== 1 ? "s" : ""} within range (${total} total)`
          : `${total} practice${total !== 1 ? "s" : ""} — apply a filter to see distances`}
      </div>

      <div style={styles.list}>
        {!hasFilter && (
          <div style={styles.empty}>
            Select an origin and apply a distance filter to see results.
          </div>
        )}

        {hasFilter && origin && (
          <>
            <div style={{ ...styles.listHeader, color: "#00A94F", borderTop: "none" }}>
              Origin
            </div>
            <PracticeCard practice={origin} />
          </>
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
