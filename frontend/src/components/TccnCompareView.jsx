import React, { useState, useEffect, useMemo } from "react";
import { api } from "../api.js";

const TAB_MATCHED    = "matched";
const TAB_DIR_ONLY   = "dir_only";
const TAB_MASTER_ONLY = "master_only";

const s = {
  wrap:    { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "#fff" },
  toolbar: { padding: "10px 16px", borderBottom: "1px solid #e2e8f0", background: "#f7fafc", flexShrink: 0 },
  tabs:    { display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", flexShrink: 0, background: "#fff" },
  tab:     (active) => ({
    padding: "8px 18px", fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? "#00A94F" : "#718096",
    borderBottom: active ? "2px solid #00A94F" : "2px solid transparent",
    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
  }),
  tableWrap: { flex: 1, overflowY: "auto" },
  table:   { width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "system-ui, sans-serif" },
  th:      { padding: "7px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#4a5568",
             borderBottom: "2px solid #e2e8f0", background: "#f7fafc", position: "sticky", top: 0, whiteSpace: "nowrap" },
  td:      { padding: "6px 12px", borderBottom: "1px solid #f0f4f8", verticalAlign: "top" },
  badge:   (color) => ({
    display: "inline-block", padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 600,
    background: color + "22", color: color,
  }),
  stat:    { display: "inline-flex", flexDirection: "column", alignItems: "center",
             background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6,
             padding: "8px 18px", minWidth: 90 },
  statNum: { fontSize: 22, fontWeight: 700, color: "#2d3748" },
  statLbl: { fontSize: 10, color: "#718096", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  diff:    (n) => ({ fontWeight: 600, color: n > 0 ? "#38a169" : n < 0 ? "#e53e3e" : "#718096" }),
};

function ProviderList({ names }) {
  const [open, setOpen] = useState(false);
  if (!names?.length) return <span style={{ color: "#a0aec0" }}>—</span>;
  return (
    <div>
      <span
        style={{ color: "#4299e1", cursor: "pointer", fontSize: 11 }}
        onClick={() => setOpen(v => !v)}
      >
        {names.length} provider{names.length !== 1 ? "s" : ""} {open ? "▲" : "▼"}
      </span>
      {open && (
        <ul style={{ margin: "4px 0 0 0", padding: "0 0 0 14px", fontSize: 11, color: "#4a5568" }}>
          {names.map(n => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function TccnCompareView() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState(TAB_MATCHED);
  const [search,  setSearch]  = useState("");
  const [scraping, setScraping] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getTccnCompare());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleScrape = async () => {
    if (!window.confirm("Re-scrape the TCCN directory? This takes ~2 minutes.")) return;
    setScraping(true);
    try {
      await api.triggerTccnScrape();
      await load();
    } catch (e) {
      alert("Scrape failed: " + e.message);
    } finally {
      setScraping(false);
    }
  };

  const q = search.toLowerCase();

  const filtered = useMemo(() => {
    if (!data) return { matched: [], dir_only: [], master_only: [] };
    const f = (arr, keys) => !q ? arr : arr.filter(r => keys.some(k => (r[k] ?? "").toLowerCase().includes(q)));
    return {
      matched:     f(data.matched,     ["dir_name", "master_name", "master_address"]),
      dir_only:    f(data.dir_only,    ["practice_name"]),
      master_only: f(data.master_only, ["name", "address"]),
    };
  }, [data, q]);

  if (loading) return <div style={{ padding: 32, color: "#718096" }}>Loading comparison…</div>;
  if (error)   return <div style={{ padding: 32, color: "#e53e3e" }}>Error: {error}</div>;

  const tabLabel = (key, label, count) => (
    <div style={s.tab(tab === key)} onClick={() => setTab(key)}>
      {label} <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.7 }}>({count})</span>
    </div>
  );

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.toolbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#2d3748" }}>TCCN Directory vs Master Table</span>
          {data?.scraped_at && (
            <span style={{ fontSize: 11, color: "#a0aec0" }}>
              Directory scraped {new Date(data.scraped_at).toLocaleDateString()}
            </span>
          )}
          <button
            onClick={handleScrape}
            disabled={scraping}
            style={{ marginLeft: "auto", padding: "4px 12px", fontSize: 12, borderRadius: 4,
              border: "1px solid #cbd5e0", background: scraping ? "#e2e8f0" : "#fff",
              color: "#4a5568", cursor: scraping ? "not-allowed" : "pointer" }}
          >
            {scraping ? "Scraping…" : "Re-scrape directory"}
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <div style={s.stat}>
            <span style={s.statNum}>{data.directory_total_providers}</span>
            <span style={s.statLbl}>Directory providers</span>
          </div>
          <div style={s.stat}>
            <span style={s.statNum}>{data.directory_total_practices}</span>
            <span style={s.statLbl}>Directory practices</span>
          </div>
          <div style={s.stat}>
            <span style={s.statNum}>{data.master_total_practices}</span>
            <span style={s.statLbl}>Master TCCN practices</span>
          </div>
          <div style={{ ...s.stat, borderColor: "#9ae6b4" }}>
            <span style={{ ...s.statNum, color: "#276749" }}>{data.matched_count}</span>
            <span style={s.statLbl}>Matched</span>
          </div>
          <div style={{ ...s.stat, borderColor: "#fbd38d" }}>
            <span style={{ ...s.statNum, color: "#c05621" }}>{data.dir_only_count}</span>
            <span style={s.statLbl}>Dir only</span>
          </div>
          <div style={{ ...s.stat, borderColor: "#fed7d7" }}>
            <span style={{ ...s.statNum, color: "#c53030" }}>{data.master_only_count}</span>
            <span style={s.statLbl}>Master only</span>
          </div>
        </div>

        {/* Search */}
        <input
          style={{ marginTop: 10, width: 300, padding: "5px 10px", border: "1px solid #cbd5e0",
            borderRadius: 5, fontSize: 12, outline: "none", boxSizing: "border-box" }}
          placeholder="Search practice names…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {tabLabel(TAB_MATCHED,     "Matched",        filtered.matched.length)}
        {tabLabel(TAB_DIR_ONLY,    "Directory only", filtered.dir_only.length)}
        {tabLabel(TAB_MASTER_ONLY, "Master only",    filtered.master_only.length)}
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        {tab === TAB_MATCHED && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Directory name</th>
                <th style={s.th}>Master name</th>
                <th style={s.th}>Master address</th>
                <th style={{ ...s.th, textAlign: "right" }}>Dir providers</th>
                <th style={{ ...s.th, textAlign: "right" }}>Master MDs</th>
                <th style={{ ...s.th, textAlign: "right" }}>Master APPs</th>
                <th style={{ ...s.th, textAlign: "right" }}>Diff</th>
                <th style={s.th}>Directory providers</th>
              </tr>
            </thead>
            <tbody>
              {filtered.matched.map((r, i) => {
                const diff = r.dir_providers - r.master_providers;
                return (
                  <tr key={i}>
                    <td style={s.td}>{r.dir_name}</td>
                    <td style={{ ...s.td, color: r.dir_name === r.master_name ? "#718096" : "#2d3748", fontStyle: r.dir_name === r.master_name ? "normal" : "italic" }}>
                      {r.dir_name === r.master_name ? "—" : r.master_name}
                    </td>
                    <td style={{ ...s.td, color: "#718096", fontSize: 11 }}>{r.master_address}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>{r.dir_providers}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>{r.master_mds}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>{r.master_apps}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>
                      <span style={s.diff(diff)}>{diff > 0 ? `+${diff}` : diff}</span>
                    </td>
                    <td style={s.td}><ProviderList names={r.provider_names} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === TAB_DIR_ONLY && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Directory practice name</th>
                <th style={{ ...s.th, textAlign: "right" }}>Providers</th>
                <th style={{ ...s.th, textAlign: "right" }}>Locations</th>
                <th style={s.th}>Providers list</th>
              </tr>
            </thead>
            <tbody>
              {filtered.dir_only.map((r, i) => (
                <tr key={i}>
                  <td style={s.td}>{r.practice_name}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{r.provider_count}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{r.location_count}</td>
                  <td style={s.td}><ProviderList names={r.provider_names} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === TAB_MASTER_ONLY && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Master practice name</th>
                <th style={s.th}>Address</th>
                <th style={{ ...s.th, textAlign: "right" }}>MDs</th>
                <th style={{ ...s.th, textAlign: "right" }}>APPs</th>
              </tr>
            </thead>
            <tbody>
              {filtered.master_only.map((r) => (
                <tr key={r.id}>
                  <td style={s.td}>{r.name}</td>
                  <td style={{ ...s.td, color: "#718096", fontSize: 11 }}>{r.address}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{r.num_mds}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>{r.num_apps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
