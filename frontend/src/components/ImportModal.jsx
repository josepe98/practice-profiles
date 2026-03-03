import React, { useState, useRef } from "react";
import { api } from "../api.js";

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modal = {
  background: "#fff",
  borderRadius: 10,
  padding: 28,
  width: 420,
  maxWidth: "95vw",
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};

const styles = {
  title: { fontSize: 17, fontWeight: 600, marginBottom: 16 },
  dropzone: {
    border: "2px dashed #cbd5e0",
    borderRadius: 8,
    padding: "24px 16px",
    textAlign: "center",
    cursor: "pointer",
    color: "#718096",
    fontSize: 13,
    marginBottom: 12,
  },
  dropzoneActive: {
    borderColor: "#4f8ef7",
    background: "#ebf8ff",
  },
  fileName: { fontSize: 13, color: "#2d3748", marginBottom: 12 },
  row: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 },
  primaryBtn: {
    padding: "7px 18px",
    background: "#4f8ef7",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  },
  secondaryBtn: {
    padding: "7px 14px",
    background: "transparent",
    color: "#718096",
    border: "1px solid #cbd5e0",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  resultBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 6,
    fontSize: 13,
    background: "#f7fafc",
    border: "1px solid #e2e8f0",
  },
  errorItem: { color: "#c53030", fontSize: 12, marginTop: 2 },
  templateLink: {
    fontSize: 12,
    color: "#4f8ef7",
    cursor: "pointer",
    textDecoration: "underline",
  },
};

export default function ImportModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await api.importCSV(file);
      setResult(res);
      if (res.imported > 0) {
        setTimeout(onDone, 1200);
      }
    } catch (err) {
      setResult({ imported: 0, skipped: 0, errors: [err.message] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={styles.title}>Import Practices</div>

        <div
          style={{
            ...styles.dropzone,
            ...(dragging ? styles.dropzoneActive : {}),
          }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          Drop a CSV or Excel file here, or click to browse
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files[0] ?? null)}
          />
        </div>

        {file && <div style={styles.fileName}>Selected: {file.name}</div>}

        <button style={styles.templateLink} onClick={() => api.downloadTemplate()}>
          Download blank CSV template
        </button>

        {result && (
          <div style={styles.resultBox}>
            <strong>Imported:</strong> {result.imported} &nbsp;
            <strong>Skipped:</strong> {result.skipped}
            {result.errors.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {result.errors.slice(0, 5).map((e, i) => (
                  <div key={i} style={styles.errorItem}>⚠ {e}</div>
                ))}
                {result.errors.length > 5 && (
                  <div style={styles.errorItem}>…and {result.errors.length - 5} more</div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={styles.row}>
          <button style={styles.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{ ...styles.primaryBtn, opacity: !file || importing ? 0.5 : 1 }}
            onClick={handleImport}
            disabled={!file || importing}
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
