import React, { useState } from "react";
import { api } from "../api.js";

const AFFILIATIONS = [
  "Children's",
  "Wellstar",
  "Piedmont",
  "TCCN",
  "Aylo Health",
  "Zarminali",
  "Playground",
  "De Novo",
  "Other",
];

const overlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modal = {
  background: "#fff", borderRadius: 8, padding: "24px 28px",
  width: 420, maxHeight: "90vh", overflowY: "auto",
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};
const label = { fontSize: 11, fontWeight: 600, color: "#4a5568", display: "block", marginBottom: 3 };
const input = {
  width: "100%", boxSizing: "border-box", padding: "6px 9px",
  fontSize: 13, borderRadius: 4, border: "1px solid #cbd5e0", marginBottom: 12,
};
const row = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

export default function AddPracticeModal({ onClose, onCreated }) {
  const [name, setName]           = useState("");
  const [address, setAddress]     = useState("");
  const [phone, setPhone]         = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [ownership, setOwnership] = useState("");
  const [isDeNovo, setIsDeNovo]   = useState(false);
  const [numMds, setNumMds]       = useState("");
  const [numApps, setNumApps]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const handleDeNovoToggle = (checked) => {
    setIsDeNovo(checked);
    if (checked) {
      setAffiliation("De Novo");
      setOwnership("De Novo");
    } else {
      if (affiliation === "De Novo") setAffiliation("");
      if (ownership === "De Novo") setOwnership("");
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!address.trim()) { setError("Address is required"); return; }
    setLoading(true);
    setError(null);
    try {
      // Geocode address via Mapbox
      let lat = null, lng = null;
      try {
        const geo = await api.geocodeAddress(address.trim());
        lat = geo.lat;
        lng = geo.lng;
      } catch {
        // Non-fatal: practice saved without coordinates
      }
      const practice = await api.createPractice({
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim() || null,
        affiliation: affiliation.trim() || null,
        ownership: ownership.trim() || null,
        is_de_novo: isDeNovo,
        num_mds: parseInt(numMds, 10) || 0,
        num_apps: parseInt(numApps, 10) || 0,
        num_locations: 1,
        lat,
        lng,
      });
      onCreated(practice);
      onClose();
    } catch (err) {
      setError(err.message ?? "Failed to create practice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1a202c" }}>Add Practice</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#718096", lineHeight: 1 }}>×</button>
        </div>

        <label style={{ ...label, display: "flex", alignItems: "center", gap: 8, marginBottom: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isDeNovo}
            onChange={(e) => handleDeNovoToggle(e.target.checked)}
            style={{ accentColor: "#6b46c1", width: 14, height: 14 }}
          />
          <span style={{ fontSize: 12, color: "#4a5568", fontWeight: 600 }}>De Novo (prospective/candidate practice)</span>
        </label>

        <label style={label}>Name *</label>
        <input
          style={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Practice name"
        />

        <label style={label}>Address *</label>
        <input
          style={input}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street address, city, state"
        />

        <label style={label}>Phone</label>
        <input
          style={input}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(optional)"
        />

        <div style={row}>
          <div>
            <label style={label}>Affiliation</label>
            <select
              value={affiliation}
              onChange={(e) => setAffiliation(e.target.value)}
              style={{ ...input, marginBottom: 0 }}
            >
              <option value="">— none —</option>
              {AFFILIATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Ownership</label>
            <input
              style={{ ...input, marginBottom: 0 }}
              value={ownership}
              onChange={(e) => setOwnership(e.target.value)}
              placeholder="(optional)"
            />
          </div>
        </div>

        <div style={{ ...row, marginTop: 12 }}>
          <div>
            <label style={label}>MDs / Physicians</label>
            <input
              type="number" min="0" style={{ ...input, marginBottom: 0 }}
              value={numMds}
              onChange={(e) => setNumMds(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label style={label}>APPs</label>
            <input
              type="number" min="0" style={{ ...input, marginBottom: 0 }}
              value={numApps}
              onChange={(e) => setNumApps(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: "#e53e3e", marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "7px 16px", borderRadius: 4, border: "1px solid #cbd5e0", background: "#fff", fontSize: 13, cursor: "pointer", color: "#4a5568" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: "7px 18px", borderRadius: 4, border: "none",
              background: loading ? "#a0aec0" : "#6b46c1",
              color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Saving…" : "Add Practice"}
          </button>
        </div>
      </div>
    </div>
  );
}
