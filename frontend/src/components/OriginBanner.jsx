import React from "react";

const SOURCE = "Source: US Census Bureau 2024 ACS 5-year estimates";

const styles = {
  banner: {
    padding: "6px 16px",
    fontSize: 13,
    background: "#f0faf5",
    borderBottom: "1px solid #b3e6cc",
    color: "#00A94F",
    flexShrink: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  prompt: {
    padding: "6px 16px",
    fontSize: 13,
    background: "#f0faf5",
    borderBottom: "1px solid #b3e6cc",
    color: "#00A94F",
    flexShrink: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  source: {
    fontSize: 11,
    color: "#a0aec0",
    fontWeight: 400,
  },
};

export default function OriginBanner({ origin, customOrigin, onClearCustomOrigin }) {
  if (origin) {
    return (
      <div style={styles.banner}>
        <span><strong>Origin:</strong> {origin.name} — {origin.address}</span>
        <span style={styles.source}>{SOURCE}</span>
      </div>
    );
  }
  if (customOrigin) {
    return (
      <div style={styles.banner}>
        <span>
          <strong>Custom location:</strong> {customOrigin.lat.toFixed(4)}, {customOrigin.lng.toFixed(4)}
          <button
            onClick={onClearCustomOrigin}
            style={{
              marginLeft: 12,
              padding: "2px 8px",
              fontSize: 11,
              background: "transparent",
              color: "#00A94F",
              border: "1px solid #00A94F",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Clear pin
          </button>
        </span>
        <span style={styles.source}>{SOURCE}</span>
      </div>
    );
  }
  return (
    <div style={styles.prompt}>
      <span>Click a marker or anywhere on the map to set an origin, then apply a distance filter.</span>
      <span style={styles.source}>{SOURCE}</span>
    </div>
  );
}
