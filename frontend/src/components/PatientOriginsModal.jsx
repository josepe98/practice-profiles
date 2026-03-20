import React, { useState, useRef } from "react";
import { api } from "../api.js";

const overlay = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000,
};

const modal = {
  background: "#fff",
  borderRadius: 8,
  boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
  width: 560,
  maxWidth: "95vw",
  maxHeight: "85vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 10px",
  fontSize: 13,
  borderRadius: 4,
  border: "1px solid #cbd5e0",
};

export default function PatientOriginsModal({ practices, datasets, onClose, onRefresh }) {
  const [practiceId, setPracticeId]   = useState(practices[0]?.id ?? "");
  const [datasetName, setDatasetName] = useState("");
  const [file, setFile]               = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [error, setError]             = useState(null);
  const [deleting, setDeleting]       = useState(null);
  const fileRef = useRef(null);

  const suggestedName = () => {
    const p = practices.find((p) => p.id === Number(practiceId));
    const year = new Date().getFullYear();
    return p ? `${p.name} ${year}` : "";
  };

  const handleSubmit = async () => {
    if (!practiceId || !file) return;
    const name = datasetName.trim() || suggestedName();
    setUploading(true);
    setError(null);
    try {
      await api.uploadPatientOrigins(Number(practiceId), name, file);
      setFile(null);
      setDatasetName("");
      if (fileRef.current) fileRef.current.value = "";
      onRefresh();
    } catch (err) {
      setError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this dataset?")) return;
    setDeleting(id);
    try {
      await api.deletePatientOriginDataset(id);
      onRefresh();
    } catch (err) {
      alert(err.message ?? "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Patient Origin Datasets</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#718096" }}>×</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* Upload form */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#4a5568", marginBottom: 10 }}>Upload new dataset</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: "#718096", marginBottom: 3 }}>Practice</div>
                <select
                  value={practiceId}
                  onChange={(e) => setPracticeId(e.target.value)}
                  style={{ ...inputStyle }}
                >
                  {practices.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#718096", marginBottom: 3 }}>Dataset name</div>
                <input
                  style={inputStyle}
                  placeholder={suggestedName() || "e.g. Snapfinger Woods 2026 YTD"}
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#718096", marginBottom: 3 }}>File (.xlsx or .csv — zip code + visit count columns)</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => setFile(e.target.files[0] ?? null)}
                  style={{ fontSize: 13 }}
                />
              </div>
              {error && <div style={{ fontSize: 12, color: "#e53e3e" }}>{error}</div>}
              <button
                onClick={handleSubmit}
                disabled={!practiceId || !file || uploading}
                style={{
                  alignSelf: "flex-start",
                  padding: "7px 18px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 5,
                  border: "none",
                  background: !practiceId || !file || uploading ? "#cbd5e0" : "#00A94F",
                  color: "#fff",
                  cursor: !practiceId || !file || uploading ? "not-allowed" : "pointer",
                }}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>

          {/* Existing datasets */}
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#4a5568", marginBottom: 10 }}>
              Existing datasets ({datasets.length})
            </div>
            {datasets.length === 0 && (
              <div style={{ fontSize: 13, color: "#a0aec0" }}>No datasets uploaded yet.</div>
            )}
            {datasets.map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f4f8" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "#718096" }}>
                    {d.practice_name} · {d.zip_count} zip codes · {new Date(d.uploaded_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  disabled={deleting === d.id}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 4,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#e53e3e",
                    cursor: deleting === d.id ? "not-allowed" : "pointer",
                  }}
                >
                  {deleting === d.id ? "…" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
