import React from "react";

const badge = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 7px",
  borderRadius: 99,
  fontWeight: 500,
};

function Badge({ label, value, bg, color, small }) {
  return (
    <span style={{ ...badge, background: bg, color, fontSize: small ? 10 : 11 }}>
      {label}: <strong>{value ?? "—"}</strong>
    </span>
  );
}

export default function PracticeCard({ practice, small }) {
  const { name, address, miles, drive_minutes, num_mds, num_apps } = practice;

  const cardStyle = {
    padding: small ? "7px 14px" : "10px 14px",
    borderBottom: "1px solid #e2e8f0",
    fontSize: small ? 11 : 13,
  };

  const nameStyle = {
    fontWeight: 600,
    color: small ? "#4a5568" : "#1a202c",
    marginBottom: 2,
  };

  const addressStyle = {
    color: small ? "#718096" : "#718096",
    fontSize: small ? 10 : 12,
    marginBottom: 4,
  };

  return (
    <div style={cardStyle}>
      <div style={nameStyle}>{name}</div>
      <div style={addressStyle}>{address}</div>
      <div style={{ display: "flex", gap: small ? 6 : 12, flexWrap: "wrap" }}>
        {miles != null && (
          <Badge label="Miles" value={miles.toFixed(1)} bg="#ebf8ff" color="#2b6cb0" small={small} />
        )}
        {drive_minutes != null && (
          <Badge label="Drive" value={`${Math.round(drive_minutes)} min`} bg="#e9d8fd" color="#553c9a" small={small} />
        )}
        <Badge label="MDs"  value={num_mds}  bg="#f0fff4" color="#276749" small={small} />
        <Badge label="APPs" value={num_apps} bg="#fffaf0" color="#744210" small={small} />
      </div>
    </div>
  );
}
