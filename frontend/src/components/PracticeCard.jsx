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

function affiliationColor(affiliation) {
  const aff = (affiliation ?? "").toLowerCase();
  if (aff === "wellstar") return { bg: "#f3ebfa", color: "#6b21a8" };
  if (aff === "children's")    return { bg: "#e6f4ee", color: "#166534" };
  if (aff === "tccn")          return { bg: "#166534", color: "#e6f4ee" };
  if (aff === "piedmont")      return { bg: "#fef0eb", color: "#9a3412" };
  return { bg: "#edf2f7", color: "#4a5568" };
}

export default function PracticeCard({ practice, small }) {
  const { name, address, miles, drive_minutes, num_mds, num_apps, affiliation } = practice;

  const cardStyle = {
    padding: small ? "7px 14px" : "10px 14px",
    borderBottom: "1px solid #e2e8f0",
    fontSize: small ? 11 : 13,
  };

  const nameStyle = {
    fontWeight: 600,
    color: small ? "#4a5568" : "#1a202c",
    marginBottom: 2,
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  };

  const addressStyle = {
    color: small ? "#718096" : "#718096",
    fontSize: small ? 10 : 12,
    marginBottom: 4,
  };

  const affColors = affiliation ? affiliationColor(affiliation) : null;

  return (
    <div style={cardStyle}>
      <div style={nameStyle}>
        <span>{name}</span>
        {affiliation && (
          <span style={{
            fontSize: small ? 9 : 10,
            fontWeight: 500,
            padding: "1px 6px",
            borderRadius: 99,
            background: affColors.bg,
            color: affColors.color,
            whiteSpace: "nowrap",
          }}>
            {affiliation}
          </span>
        )}
      </div>
      <div style={addressStyle}>{address}</div>
      <div style={{ display: "flex", gap: small ? 6 : 12, flexWrap: "wrap" }}>
        {miles != null && (
          <Badge label="Miles" value={miles.toFixed(1)} bg="#edf2f7" color="#4a5568" small={small} />
        )}
        {drive_minutes != null && (
          <Badge label="Drive" value={`${Math.round(drive_minutes)} min`} bg="#edf2f7" color="#4a5568" small={small} />
        )}
        <Badge label="MDs"  value={num_mds}  bg="#edf2f7" color="#4a5568" small={small} />
        <Badge label="APPs" value={num_apps} bg="#edf2f7" color="#4a5568" small={small} />
      </div>
    </div>
  );
}
