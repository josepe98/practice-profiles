import React, { useState, useRef, useEffect } from "react";

const styles = {
  wrap: { position: "relative", padding: "10px 12px", borderBottom: "1px solid #e2e8f0" },
  input: {
    width: "100%",
    padding: "7px 30px 7px 10px",
    border: "1px solid #cbd5e0",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  },
  clearBtn: {
    position: "absolute",
    right: 18,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 15,
    color: "#a0aec0",
    lineHeight: 1,
    padding: "0 2px",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 12,
    right: 12,
    background: "#fff",
    border: "1px solid #cbd5e0",
    borderRadius: 6,
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    zIndex: 100,
    maxHeight: 260,
    overflowY: "auto",
  },
  item: {
    padding: "8px 12px",
    cursor: "pointer",
    borderBottom: "1px solid #f0f4f8",
    fontSize: 12,
  },
  itemName: { fontWeight: 600, color: "#1a202c", marginBottom: 1 },
  itemAddr: { color: "#718096", fontSize: 11 },
  noResults: { padding: "10px 12px", fontSize: 12, color: "#a0aec0" },
};

export default function SearchBar({ practices, onSelect }) {
  const [query, setQuery]       = useState("");
  const [open, setOpen]         = useState(false);
  const [active, setActive]     = useState(-1);
  const wrapRef                 = useRef(null);
  const inputRef                = useRef(null);

  const q = query.trim().toLowerCase();
  const results = q.length < 1 ? [] : practices
    .filter((p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q))
    .slice(0, 8);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (practice) => {
    setQuery(practice.name);
    setOpen(false);
    setActive(-1);
    onSelect(practice);
  };

  const handleKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && active >= 0) handleSelect(results[active]);
    if (e.key === "Escape") setOpen(false);
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    setActive(-1);
  };

  const handleClear = () => {
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapRef} style={styles.wrap}>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          style={styles.input}
          placeholder="Search practices…"
          value={query}
          onChange={handleChange}
          onFocus={() => q.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button style={styles.clearBtn} onClick={handleClear} tabIndex={-1}>×</button>
        )}
      </div>

      {open && q.length > 0 && (
        <div style={styles.dropdown}>
          {results.length === 0 ? (
            <div style={styles.noResults}>No practices match "{query}"</div>
          ) : (
            results.map((p, i) => (
              <div
                key={p.id}
                style={{
                  ...styles.item,
                  background: i === active ? "#f0f9f4" : "#fff",
                }}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(-1)}
                onMouseDown={() => handleSelect(p)}
              >
                <div style={styles.itemName}>{p.name}</div>
                <div style={styles.itemAddr}>{p.address}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
