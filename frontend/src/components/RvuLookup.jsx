import React, { useState } from "react";
import { api } from "../api.js";

const YEARS = [2025, 2024];

const TH = ({ children }) => (
  <th style={{
    padding: "6px 10px",
    textAlign: "left",
    fontWeight: 600,
    fontSize: 11,
    color: "#4a5568",
    whiteSpace: "nowrap",
    borderBottom: "2px solid #e2e8f0",
    background: "#f7fafc",
  }}>
    {children}
  </th>
);

const TD = ({ children, style }) => (
  <td style={{ padding: "5px 10px", fontSize: 11, fontFamily: "monospace", ...style }}>
    {children}
  </td>
);

function parseCodes(text) {
  const seen = new Set();
  const result = [];
  for (const c of text.split(/[\s,]+/)) {
    const code = c.trim().toUpperCase();
    if (code && !seen.has(code)) { seen.add(code); result.push(code); }
  }
  return result;
}

function buildCSV(tableRows) {
  const headers = ["CPT Code", "Description", "wRVU", "Non-Fac PE RVU", "Fac PE RVU", "Status", "Global Days", "Note"];
  const rows = [headers, ...tableRows.map(r => [
    r.notFound ? r.code : r.hcpc,
    r.notFound ? "Not found" : r.sdesc,
    r.notFound ? "" : r.rvu_work,
    r.notFound ? "" : r.full_nfac_pe,
    r.notFound ? "" : r.full_fac_pe,
    r.notFound ? "" : r.proc_stat,
    r.notFound ? "" : r.global,
    r._note ?? "",
  ])];
  return rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function RvuLookup() {
  const [input, setInput] = useState("");
  const [year, setYear] = useState(2025);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const codes = parseCodes(input);

  async function handleLookup() {
    if (!codes.length) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const data = await api.getRvu(codes.join(","), year);
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Flatten results into display rows
  const tableRows = results
    ? results.flatMap(({ code, rows }) => {
        if (!rows.length) return [{ code, notFound: true }];
        return rows.map((r, i) => ({
          ...r,
          notFound: false,
          _note: rows.length > 1
            ? `${i + 1}/${rows.length} — modifier: ${r.modifier || "(none)"}`
            : null,
        }));
      })
    : [];

  function handleExportCSV() {
    const csv = buildCSV(tableRows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rvu_lookup_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: "28px 36px", fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 1000, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", color: "#1a202c" }}>RVU Lookup</h1>
        <div style={{ fontSize: 12, color: "#718096" }}>
          CMS Physician Fee Schedule · {year}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 24 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleLookup(); }}
          placeholder={"Paste CPT codes — one per line, or comma-separated\n\ne.g.\n99213\n99214\n99215"}
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            width: 260,
            height: 140,
            padding: "8px 10px",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            resize: "vertical",
            outline: "none",
            color: "#2d3748",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              fontSize: 13,
              color: "#2d3748",
              cursor: "pointer",
            }}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={handleLookup}
            disabled={loading || !codes.length}
            style={{
              padding: "7px 20px",
              background: "#00A94F",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading || !codes.length ? "not-allowed" : "pointer",
              opacity: loading || !codes.length ? 0.6 : 1,
            }}
          >
            {loading
              ? `Looking up ${codes.length} code${codes.length !== 1 ? "s" : ""}…`
              : "Look Up"}
          </button>
          {results && (
            <button
              onClick={handleExportCSV}
              style={{
                padding: "7px 20px",
                background: "#5A5A5A",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Export CSV
            </button>
          )}
        </div>

        {codes.length > 0 && (
          <div style={{ fontSize: 12, color: "#718096", alignSelf: "flex-end", paddingBottom: 4 }}>
            {codes.length} code{codes.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: "#c53030", fontSize: 13, marginBottom: 16 }}>
          Error: {error}
        </div>
      )}

      {/* Results table */}
      {tableRows.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <TH>CPT Code</TH>
                <TH>Description</TH>
                <TH>wRVU</TH>
                <TH>Non-Fac PE RVU</TH>
                <TH>Fac PE RVU</TH>
                <TH>Status</TH>
                <TH>Global Days</TH>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => {
                const notFound = row.notFound;
                const notActive = !notFound && row.proc_stat !== "A";
                const bg = notFound
                  ? "#fff5f5"
                  : notActive
                  ? "#fffbeb"
                  : i % 2 === 0 ? "#fff" : "#f9fafb";

                return (
                  <tr key={i} style={{ background: bg, borderBottom: "1px solid #edf2f7" }}>
                    <TD style={{ fontWeight: 600 }}>
                      {notFound ? row.code : row.hcpc}
                    </TD>
                    <TD style={{ color: notFound ? "#c53030" : "#2d3748" }}>
                      {notFound ? "Not found" : row.sdesc}
                      {row._note && (
                        <span style={{ color: "#a0aec0", marginLeft: 8, fontWeight: 400 }}>
                          ({row._note})
                        </span>
                      )}
                    </TD>
                    <TD style={{ fontWeight: notFound ? 400 : 600 }}>
                      {notFound ? "—" : row.rvu_work}
                    </TD>
                    <TD>{notFound ? "—" : row.full_nfac_pe}</TD>
                    <TD>{notFound ? "—" : row.full_fac_pe}</TD>
                    <TD style={{ color: notActive ? "#c05621" : "inherit", fontWeight: notActive ? 600 : 400 }}>
                      {notFound ? "—" : row.proc_stat}
                    </TD>
                    <TD>{notFound ? "—" : row.global}</TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {results && tableRows.length === 0 && (
        <div style={{ color: "#718096", fontSize: 13 }}>No results.</div>
      )}
    </div>
  );
}
