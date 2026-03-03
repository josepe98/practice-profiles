import React from "react";

const styles = {
  banner: {
    padding: "6px 16px",
    fontSize: 13,
    background: "#f0faf5",
    borderBottom: "1px solid #b3e6cc",
    color: "#00A94F",
    flexShrink: 0,
  },
  prompt: {
    padding: "6px 16px",
    fontSize: 13,
    background: "#fffff0",
    borderBottom: "1px solid #fefcbf",
    color: "#744210",
    flexShrink: 0,
  },
};

export default function OriginBanner({ origin }) {
  if (origin) {
    return (
      <div style={styles.banner}>
        <strong>Origin:</strong> {origin.name} — {origin.address}
      </div>
    );
  }
  return (
    <div style={styles.prompt}>
      Click a marker on the map to set the origin practice, then apply a distance filter.
    </div>
  );
}
