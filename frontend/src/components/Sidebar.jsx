import React, { useState } from "react";
import FilterBar from "./FilterBar.jsx";
import PracticeCard from "./PracticeCard.jsx";
import SearchBar from "./SearchBar.jsx";
import PopulationPanel from "./PopulationPanel.jsx";

const s = {
  sidebar: {
    width: 320, flexShrink: 0, display: "flex", flexDirection: "column",
    borderLeft: "1px solid #e2e8f0", background: "#fff", overflow: "hidden",
  },
  sectionHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 14px", fontSize: 11, fontWeight: 700, color: "#718096",
    textTransform: "uppercase", letterSpacing: "0.05em",
    background: "#f7fafc", borderBottom: "1px solid #e2e8f0",
    cursor: "pointer", userSelect: "none", flexShrink: 0,
  },
  fixedHeader: {
    padding: "8px 14px", fontSize: 11, fontWeight: 700, color: "#718096",
    textTransform: "uppercase", letterSpacing: "0.05em",
    background: "#f7fafc", borderBottom: "1px solid #e2e8f0", flexShrink: 0,
  },
  sectionBody: { padding: "12px 14px", borderBottom: "1px solid #e2e8f0" },
  listHeader: {
    padding: "8px 16px", fontSize: 12, fontWeight: 600, color: "#4a5568",
    background: "#f7fafc", borderBottom: "1px solid #e2e8f0", flexShrink: 0,
  },
  list: { flex: 1, overflowY: "auto" },
  empty: { padding: 20, fontSize: 13, color: "#a0aec0", textAlign: "center" },
  checkRow: {
    display: "flex", alignItems: "center", gap: 6,
    cursor: "pointer", userSelect: "none", marginBottom: 6,
  },
  checkLabel: { fontSize: 12, color: "#4a5568" },
};

function CollapsibleSection({ title, defaultOpen = false, noPadding = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={s.sectionHeader} onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <span style={{ fontSize: 10, color: "#a0aec0" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (noPadding ? <>{children}</> : <div style={s.sectionBody}>{children}</div>)}
    </div>
  );
}

export default function Sidebar({
  practices, originId, customOrigin, filteredResults, populationData,
  showTracts, onToggleTracts, overlapThreshold, onThresholdChange,
  loading, onFilter, onClearFilter, onSearchSelect,
  showHighways, onToggleHighways, showDensity, onToggleDensity,
  candidatePOIs, showCandidates, onToggleCandidates,
  showCandidateLabels, onToggleCandidateLabels,
  onClearCandidates, onRemoveCandidate,
  onAddCandidateByAddress, onOpenAddPractice,
  patientOriginDatasets, selectedPatientDatasetId, onSelectPatientDataset,
  showPatientOrigins, onTogglePatientOrigins,
  showTractDetail, onToggleTractDetail,
}) {
  const [candName, setCandName]         = useState("");
  const [candAddress, setCandAddress]   = useState("");
  const [candPracticeId, setCandPracticeId] = useState("");
  const [candNotes, setCandNotes]       = useState("");
  const [candUrl, setCandUrl]           = useState("");
  const [candLoading, setCandLoading]   = useState(false);
  const [candError, setCandError]       = useState(null);

  const handleAddByAddress = async () => {
    if (!candAddress.trim()) return;
    if (!candPracticeId) { setCandError("Please select a linked practice"); return; }
    setCandLoading(true);
    setCandError(null);
    try {
      await onAddCandidateByAddress(candName, candAddress, Number(candPracticeId), candNotes, candUrl);
      setCandName("");
      setCandAddress("");
      setCandPracticeId("");
      setCandNotes("");
      setCandUrl("");
    } catch (err) {
      setCandError(err.message ?? "Address not found");
    } finally {
      setCandLoading(false);
    }
  };

  const hasFilter = filteredResults !== null;
  const displayList = hasFilter ? filteredResults : [];
  const count = hasFilter ? filteredResults.length : practices.length;
  const total = practices.length;
  const origin = practices.find((p) => p.id === originId) ?? null;
  const hasOrigin = origin != null || customOrigin != null;

  return (
    <div style={s.sidebar}>
      {/* Search — always visible at top */}
      <SearchBar practices={practices} onSelect={onSearchSelect} />

      {/* ── Catchment Analysis ─────────────────────────────────── */}
      <div style={{ flexShrink: 0 }}>
        <div style={s.fixedHeader}>Catchment Analysis</div>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0" }}>
          <FilterBar
            originId={originId}
            customOrigin={customOrigin}
            loading={loading}
            onFilter={onFilter}
            onClearFilter={onClearFilter}
          />
        </div>

        {/* Population results — shown only when active */}
        {populationData && (
          <CollapsibleSection title="Catchment Population" defaultOpen={true} noPadding>
            <PopulationPanel data={populationData} hideTitle />
            <div style={{ padding: "8px 14px", borderBottom: "1px solid #e2e8f0", background: "#f7fafc", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={onToggleTracts}
                style={{
                  fontSize: 12, padding: "4px 10px", borderRadius: 4,
                  border: `1px solid ${showTracts ? "#6b46c1" : "#cbd5e0"}`,
                  background: showTracts ? "#6b46c1" : "#fff",
                  color: showTracts ? "#fff" : "#4a5568",
                  cursor: "pointer", fontWeight: 500,
                }}
              >
                {showTracts ? "Hide census tracts" : "Show census tracts"}
              </button>
              <select
                value={Math.round(overlapThreshold * 100)}
                onChange={(e) => onThresholdChange(parseInt(e.target.value, 10) / 100)}
                title="Minimum % of tract area inside polygon"
                style={{
                  fontSize: 12, padding: "3px 6px", borderRadius: 4,
                  border: "1px solid #cbd5e0", background: "#fff",
                  color: "#4a5568", cursor: "pointer",
                }}
              >
                {[20, 40, 60, 80, 100].map((pct) => (
                  <option key={pct} value={pct}>{pct}% overlap</option>
                ))}
              </select>
              <button
                onClick={onToggleTractDetail}
                style={{
                  fontSize: 12, padding: "4px 10px", borderRadius: 4,
                  border: `1px solid ${showTractDetail ? "#2d6a4f" : "#cbd5e0"}`,
                  background: showTractDetail ? "#2d6a4f" : "#fff",
                  color: showTractDetail ? "#fff" : "#4a5568",
                  cursor: "pointer", fontWeight: 500,
                }}
              >
                {showTractDetail ? "← Close detail" : "Tract detail"}
              </button>
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* ── Map Layers ─────────────────────────────────────────── */}
      <CollapsibleSection title="Map Layers">
        <label style={s.checkRow}>
          <input
            type="checkbox" checked={showDensity ?? false} onChange={onToggleDensity}
            style={{ accentColor: "#3182ce", width: 13, height: 13, cursor: "pointer" }}
          />
          <span style={s.checkLabel}>Pediatric population density</span>
        </label>
        <label style={s.checkRow}>
          <input
            type="checkbox" checked={showHighways ?? false} onChange={onToggleHighways}
            style={{ accentColor: "#f59e0b", width: 13, height: 13, cursor: "pointer" }}
          />
          <span style={s.checkLabel}>Highlight freeways &amp; major highways</span>
        </label>

        {(patientOriginDatasets?.length ?? 0) > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#718096", marginBottom: 4 }}>
              Patient origins by zip code
            </div>
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
              <label style={{ ...s.checkRow, marginBottom: 0 }}>
                <input
                  type="checkbox" checked={showPatientOrigins ?? true} onChange={onTogglePatientOrigins}
                  style={{ accentColor: "#bd0026", width: 13, height: 13, cursor: "pointer" }}
                />
                <span style={s.checkLabel}>Show layer</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                  {["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"].map((c, i) => (
                    <span key={i} style={{ width: 12, height: 12, background: c, display: "inline-block", borderRadius: 1 }} />
                  ))}
                  <span style={{ fontSize: 10, color: "#718096", marginLeft: 3 }}>low → high</span>
                </span>
              </label>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Candidate Locations ────────────────────────────────── */}
      <CollapsibleSection title="Candidate Locations">
        {/* Top controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button
            onClick={onOpenAddPractice}
            style={{
              padding: "4px 10px", fontSize: 12, fontWeight: 500, borderRadius: 4,
              border: "1px solid #6b46c1", background: "#fff", color: "#6b46c1", cursor: "pointer",
            }}
          >
            + Add Practice
          </button>
          {(candidatePOIs?.length ?? 0) > 0 && (
            <button
              onClick={onClearCandidates}
              style={{
                padding: "4px 10px", fontSize: 12, borderRadius: 4,
                border: "1px solid #cbd5e0", background: "#fff",
                color: "#e53e3e", cursor: "pointer",
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {(candidatePOIs?.length ?? 0) > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <label style={{ ...s.checkRow, marginBottom: 0 }}>
              <input
                type="checkbox" checked={showCandidates ?? false} onChange={onToggleCandidates}
                style={{ accentColor: "#d69e2e", width: 13, height: 13, cursor: "pointer" }}
              />
              <span style={s.checkLabel}>Show pins ({candidatePOIs.length})</span>
            </label>
            {showCandidates && (
              <label style={{ ...s.checkRow, marginBottom: 0 }}>
                <input
                  type="checkbox" checked={showCandidateLabels ?? false} onChange={onToggleCandidateLabels}
                  style={{ accentColor: "#d69e2e", width: 13, height: 13, cursor: "pointer" }}
                />
                <span style={s.checkLabel}>Labels</span>
              </label>
            )}
          </div>
        )}

        {/* Candidate list */}
        {(candidatePOIs?.length ?? 0) > 0 && (
          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 6, marginBottom: 8, maxHeight: 180, overflowY: "auto" }}>
            {candidatePOIs.map((c) => {
              const practice = practices.find((p) => p.id === c.practice_id);
              return (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 5, marginBottom: 5, borderBottom: "1px solid #f7fafc" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#2d3748", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "#718096" }}>{practice?.name ?? "—"}</div>
                  </div>
                  <button onClick={() => onRemoveCandidate(c.id)} style={{ background: "none", border: "none", color: "#a0aec0", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add by address form */}
        <div style={{ paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#718096", marginBottom: 5 }}>
            Add candidate location
          </div>
          <input
            placeholder="Name (optional)"
            value={candName}
            onChange={(e) => setCandName(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "4px 7px", fontSize: 12, borderRadius: 4, border: "1px solid #cbd5e0", marginBottom: 4 }}
          />
          <input
            placeholder="Address or place *"
            value={candAddress}
            onChange={(e) => { setCandAddress(e.target.value); setCandError(null); }}
            style={{ width: "100%", boxSizing: "border-box", padding: "4px 7px", fontSize: 12, borderRadius: 4, border: `1px solid ${candError && !candAddress.trim() ? "#e53e3e" : "#cbd5e0"}`, marginBottom: 4 }}
          />
          <select
            value={candPracticeId}
            onChange={(e) => { setCandPracticeId(e.target.value); setCandError(null); }}
            style={{ width: "100%", boxSizing: "border-box", padding: "4px 7px", fontSize: 12, borderRadius: 4, border: `1px solid ${candError && !candPracticeId ? "#e53e3e" : "#cbd5e0"}`, marginBottom: 4 }}
          >
            <option value="">— Linked practice * —</option>
            {practices.filter((p) => p.lat != null).map((p) => (
              <option key={p.id} value={p.id}>{p.is_de_novo ? `[De Novo] ${p.name}` : p.name}</option>
            ))}
          </select>
          <input
            placeholder="Notes (optional)"
            value={candNotes}
            onChange={(e) => setCandNotes(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "4px 7px", fontSize: 12, borderRadius: 4, border: "1px solid #cbd5e0", marginBottom: 4 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <input
              placeholder="URL (optional)"
              value={candUrl}
              onChange={(e) => setCandUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddByAddress(); }}
              style={{ flex: 1, padding: "4px 7px", fontSize: 12, borderRadius: 4, border: "1px solid #cbd5e0" }}
            />
            <button
              onClick={handleAddByAddress}
              disabled={candLoading || !candAddress.trim()}
              style={{
                padding: "4px 10px", fontSize: 12, fontWeight: 500,
                borderRadius: 4, border: "none",
                background: candLoading || !candAddress.trim() ? "#cbd5e0" : "#d69e2e",
                color: "#fff",
                cursor: candLoading || !candAddress.trim() ? "not-allowed" : "pointer",
                flexShrink: 0,
              }}
            >
              {candLoading ? "…" : "Add"}
            </button>
          </div>
          {candError && <div style={{ fontSize: 11, color: "#e53e3e", marginTop: 3 }}>{candError}</div>}
        </div>
      </CollapsibleSection>

      {/* ── Practice list ──────────────────────────────────────── */}
      <div style={s.listHeader}>
        {hasFilter
          ? `${count} practice${count !== 1 ? "s" : ""} within range (${total} total)`
          : hasOrigin
          ? `${total} practice${total !== 1 ? "s" : ""} total — set a filter to see nearby`
          : `${total} practice${total !== 1 ? "s" : ""} — click map or marker to begin`}
      </div>

      <div style={s.list}>
        {!hasOrigin && (
          <div style={s.empty}>Click a marker or anywhere on the map to set an origin.</div>
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
          <div style={s.empty}>Set a drive time or distance filter to see nearby practices.</div>
        )}
        {hasFilter && (
          <div style={s.listHeader}>{count} practice{count !== 1 ? "s" : ""} in range</div>
        )}
        {hasFilter && displayList.length === 0 && (
          <div style={s.empty}>No practices found within the specified range.</div>
        )}
        {displayList.map((p) => (
          <PracticeCard key={p.id} practice={p} small />
        ))}
      </div>
    </div>
  );
}
