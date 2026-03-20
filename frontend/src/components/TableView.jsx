import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { api } from "../api.js";

const COLUMNS = [
  { key: "name",          label: "Name",        type: "text",   minWidth: 200 },
  { key: "address",       label: "Address",     type: "text",   minWidth: 280 },
  { key: "affiliation",   label: "Affiliation", type: "text",   minWidth: 110 },
  { key: "ownership",     label: "Ownership",   type: "text",   minWidth: 110 },
  { key: "num_mds",       label: "MDs",         type: "number", minWidth: 58  },
  { key: "num_apps",      label: "APPs",        type: "number", minWidth: 58  },
  { key: "num_locations", label: "Locs",        type: "number", minWidth: 58  },
  { key: "lat",           label: "Lat",         type: "number", minWidth: 110 },
  { key: "lng",           label: "Lng",         type: "number", minWidth: 110 },
];

const EMPTY_ROW = {
  name: "", address: "", affiliation: "", ownership: "",
  num_mds: "", num_apps: "", num_locations: "", lat: "", lng: "",
};

export default function TableView({ practices, onRefresh }) {
  const [editing,    setEditing]    = useState(null);      // { id, key }
  const [editVal,    setEditVal]    = useState("");
  const [flash,      setFlash]      = useState({});        // { "id:key": "ok"|"err" }
  const [sort,       setSort]       = useState({ col: "name", dir: "asc" });
  const [search,     setSearch]     = useState("");
  const [addingRow,  setAddingRow]  = useState(false);
  const [newRow,     setNewRow]     = useState(EMPTY_ROW);
  const [addSaving,  setAddSaving]  = useState(false);
  const inputRef   = useRef(null);
  const newRowRef  = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  useEffect(() => {
    if (addingRow && newRowRef.current) {
      newRowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [addingRow]);

  // ── Filtering + sorting ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return practices;
    return practices.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q) ||
      p.affiliation?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q)
    );
  }, [practices, search]);

  const sorted = useMemo(() => {
    const { col, dir } = sort;
    return [...filtered].sort((a, b) => {
      const av = a[col] ?? "";
      const bv = b[col] ?? "";
      const cmp = (typeof av === "number" || typeof bv === "number")
        ? (Number(av) || 0) - (Number(bv) || 0)
        : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const toggleSort = (col) =>
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" }
    );

  // ── Cell editing ───────────────────────────────────────────────────────────

  const startEdit = (id, key, value) => {
    setEditing({ id, key });
    setEditVal(value == null ? "" : String(value));
  };

  const cancelEdit = () => setEditing(null);

  const commitEdit = useCallback(async () => {
    if (!editing) return;
    const { id, key } = editing;
    const col = COLUMNS.find(c => c.key === key);
    let val = editVal.trim() === "" ? null : editVal.trim();
    if (col.type === "number" && val !== null) val = Number(val);
    setEditing(null);
    const fk = `${id}:${key}`;
    try {
      await api.updatePractice(id, { [key]: val });
      setFlash(f => ({ ...f, [fk]: "ok" }));
      onRefresh();
    } catch {
      setFlash(f => ({ ...f, [fk]: "err" }));
    }
    setTimeout(() => setFlash(f => { const n = { ...f }; delete n[fk]; return n; }), 1400);
  }, [editing, editVal, onRefresh]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter")  { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  };

  // ── Row actions ────────────────────────────────────────────────────────────

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.deletePractice(id);
      onRefresh();
    } catch { alert("Delete failed."); }
  };

  const handleGeocode = async (id) => {
    try {
      await api.geocodePractice(id);
      onRefresh();
    } catch { alert("Geocoding failed — check the address."); }
  };

  // ── Add new row ────────────────────────────────────────────────────────────

  const handleAddRow = async () => {
    if (!newRow.name.trim() || !newRow.address.trim()) return;
    setAddSaving(true);
    try {
      const hasCoords = newRow.lat !== "" && newRow.lng !== "";
      const created = await api.createPractice({
        name:          newRow.name.trim(),
        address:       newRow.address.trim(),
        phone:         newRow.phone.trim()          || null,
        affiliation:   newRow.affiliation.trim()    || null,
        num_mds:       Number(newRow.num_mds)       || 0,
        num_apps:      Number(newRow.num_apps)      || 0,
        num_locations: Number(newRow.num_locations) || 1,
        lat:           hasCoords ? Number(newRow.lat) : null,
        lng:           hasCoords ? Number(newRow.lng) : null,
      });
      if (!hasCoords) {
        try { await api.geocodePractice(created.id); }
        catch { alert("Practice saved but geocoding failed — check the address."); }
      }
      setAddingRow(false);
      setNewRow(EMPTY_ROW);
      onRefresh();
    } catch { alert("Failed to create practice."); }
    finally { setAddSaving(false); }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const cellBg = (id, key) => {
    const k = `${id}:${key}`;
    if (flash[k] === "ok")  return "#c6f6d5";
    if (flash[k] === "err") return "#fed7d7";
    return undefined;
  };

  const thStyle = (col) => ({
    ...s.th,
    minWidth: col.minWidth,
    background: sort.col === col.key ? "#edf2f7" : "#f7fafc",
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.wrap}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <input
          style={s.search}
          placeholder="Search name, address, affiliation, phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span style={s.count}>{sorted.length} of {practices.length} practices</span>
        <button
          style={s.addBtn}
          disabled={addingRow}
          onClick={() => { setAddingRow(true); setNewRow(EMPTY_ROW); }}
        >
          + Add practice
        </button>
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 44, minWidth: 44, cursor: "default" }}>#</th>
              {COLUMNS.map(col => (
                <th key={col.key} style={thStyle(col)} onClick={() => toggleSort(col.key)}>
                  {col.label}
                  {sort.col === col.key && (
                    <span style={s.sortArrow}>{sort.dir === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
              ))}
              <th style={{ ...s.th, width: 72, minWidth: 72, cursor: "default" }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id} style={s.tr}>
                <td style={s.tdId}>{p.id}</td>
                {COLUMNS.map(col => {
                  const isEditing = editing?.id === p.id && editing?.key === col.key;
                  const bg = cellBg(p.id, col.key);
                  return (
                    <td
                      key={col.key}
                      style={{ ...s.td, background: bg }}
                      onClick={() => !isEditing && startEdit(p.id, col.key, p[col.key])}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          style={s.cellInput}
                          type={col.type === "number" ? "number" : "text"}
                          value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        <span style={s.cellText}>{p[col.key] ?? ""}</span>
                      )}
                    </td>
                  );
                })}
                <td style={s.tdActions}>
                  <button
                    style={s.actionBtn}
                    title="Re-geocode from address"
                    onClick={() => handleGeocode(p.id)}
                  >📍</button>
                  <button
                    style={{ ...s.actionBtn, color: "#e53e3e" }}
                    title="Delete"
                    onClick={() => handleDelete(p.id, p.name)}
                  >✕</button>
                </td>
              </tr>
            ))}

            {/* Add new row */}
            {addingRow && (
              <tr ref={newRowRef} style={{ ...s.tr, background: "#fffff0" }}>
                <td style={s.tdId}>—</td>
                {COLUMNS.map(col => (
                  <td key={col.key} style={s.td}>
                    <input
                      style={{ ...s.cellInput, background: "#fffff0" }}
                      type={col.type === "number" ? "number" : "text"}
                      placeholder={col.label}
                      value={newRow[col.key]}
                      onChange={e => setNewRow(r => ({ ...r, [col.key]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleAddRow()}
                    />
                  </td>
                ))}
                <td style={s.tdActions}>
                  <button
                    style={{ ...s.actionBtn, color: "#38a169", fontSize: 16, fontWeight: 700 }}
                    title="Save"
                    disabled={addSaving || !newRow.name.trim() || !newRow.address.trim()}
                    onClick={handleAddRow}
                  >✓</button>
                  <button
                    style={{ ...s.actionBtn, color: "#718096" }}
                    title="Cancel"
                    onClick={() => { setAddingRow(false); setNewRow(EMPTY_ROW); }}
                  >✕</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
    background: "#fff",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f7fafc",
    flexShrink: 0,
  },
  search: {
    width: 320,
    padding: "5px 10px",
    border: "1px solid #cbd5e0",
    borderRadius: 5,
    fontSize: 13,
    outline: "none",
  },
  count: {
    fontSize: 12,
    color: "#718096",
    marginLeft: "auto",
  },
  addBtn: {
    padding: "5px 14px",
    background: "#48bb78",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  },
  tableWrap: {
    flex: 1,
    overflow: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 11,
    fontFamily: "monospace",
  },
  th: {
    padding: "7px 10px",
    textAlign: "left",
    fontWeight: 600,
    fontSize: 12,
    color: "#4a5568",
    borderBottom: "2px solid #e2e8f0",
    borderRight: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    zIndex: 1,
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  },
  sortArrow: {
    color: "#4299e1",
  },
  tr: {
    borderBottom: "1px solid #edf2f7",
  },
  td: {
    padding: 0,
    borderRight: "1px solid #f0f4f8",
    cursor: "text",
    transition: "background 0.5s",
    maxWidth: 320,
  },
  tdId: {
    padding: "5px 8px",
    color: "#a0aec0",
    fontSize: 11,
    textAlign: "right",
    borderRight: "2px solid #e2e8f0",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  tdActions: {
    padding: "2px 6px",
    whiteSpace: "nowrap",
    textAlign: "center",
    borderLeft: "1px solid #e2e8f0",
  },
  cellText: {
    display: "block",
    padding: "4px 8px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: "14px",
  },
  cellInput: {
    display: "block",
    width: "100%",
    padding: "4px 8px",
    border: "none",
    borderBottom: "2px solid #4299e1",
    outline: "none",
    fontSize: 11,
    background: "#ebf8ff",
    boxSizing: "border-box",
  },
  actionBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    padding: "3px 4px",
    lineHeight: 1,
    color: "#718096",
    borderRadius: 3,
  },
};
