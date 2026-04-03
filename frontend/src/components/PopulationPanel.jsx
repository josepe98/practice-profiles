import React from "react";

const BANDS = [
  { key: "under_5",   label: "Under 5", color: "#4f8ef7" },
  { key: "age_5_9",   label: "5–9",     color: "#48bb78" },
  { key: "age_10_14", label: "10–14",   color: "#ed8936" },
  { key: "age_15_17", label: "15–17",   color: "#9f7aea" },
];


const styles = {
  panel: {
    padding: "10px 14px 12px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f7fafc",
  },
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  title: { fontSize: 11, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.05em" },
  sub:   { fontSize: 10, color: "#a0aec0" },
  total: { fontSize: 18, fontWeight: 700, color: "#1a202c", marginBottom: 8 },
  row: {
    display: "grid",
    gridTemplateColumns: "48px 1fr 48px",
    alignItems: "center",
    gap: "0 6px",
    marginBottom: 4,
  },
  bandLabel: { fontSize: 11, color: "#4a5568" },
  track: { height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" },
  fill:  { height: "100%", borderRadius: 3, transition: "width 0.4s ease" },
  count: { fontSize: 10, color: "#2d3748", textAlign: "right" },
  incomeSection: { marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0" },
  incomeTitle: { fontSize: 11, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 },
  incomeRow: { display: "flex", gap: 16 },
  incomeStat: { display: "flex", flexDirection: "column", gap: 1 },
  incomeLabel: { fontSize: 10, color: "#a0aec0" },
  incomeValue: { fontSize: 14, fontWeight: 700, color: "#1a202c" },
};

export default function PopulationPanel({ data, hideTitle = false }) {
  if (!data || data.total === 0) return null;

  const under18 = (data.under_5 ?? 0) + (data.age_5_9 ?? 0) + (data.age_10_14 ?? 0) + (data.age_15_17 ?? 0);
  const under18Pct = data.total > 0 ? Math.round(under18 / data.total * 100) : 0;

  return (
    <div style={styles.panel}>
      {!hideTitle && (
        <div style={styles.titleRow}>
          <span style={styles.title}>Catchment population</span>
          <span style={styles.sub}>{data.tract_count} census tract{data.tract_count !== 1 ? "s" : ""}</span>
        </div>
      )}
      {hideTitle && (
        <div style={{ ...styles.titleRow, marginBottom: 4 }}>
          <span style={styles.sub}>{data.tract_count} census tract{data.tract_count !== 1 ? "s" : ""}</span>
        </div>
      )}
      <div style={{ ...styles.total, marginBottom: 2 }}>{under18.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: "#718096", marginBottom: 8 }}>
        Total catchment: <strong style={{ color: "#1a202c" }}>{data.total.toLocaleString()}</strong>
        <span style={{ marginLeft: 4, color: "#a0aec0" }}>({under18Pct}% under 18)</span>
      </div>
      {BANDS.map(({ key, label, color }) => {
        const value = data[key] ?? 0;
        const pct   = under18 > 0 ? Math.round(value / under18 * 100) : 0;
        return (
          <div key={key} style={styles.row}>
            <span style={styles.bandLabel}>{label}</span>
            <div style={styles.track}>
              <div style={{ ...styles.fill, width: `${pct}%`, background: color }} />
            </div>
            <span style={styles.count}>{value.toLocaleString()}</span>
          </div>
        );
      })}
      {(data.income_weighted_avg != null || data.income_median != null) && (
        <div style={styles.incomeSection}>
          <div style={styles.incomeTitle}>Household income</div>
          <div style={styles.incomeRow}>
            {data.income_weighted_avg != null && (
              <div style={styles.incomeStat}>
                <span style={styles.incomeLabel}>Wtd avg</span>
                <span style={styles.incomeValue}>${data.income_weighted_avg.toLocaleString()}</span>
              </div>
            )}
            {data.income_median != null && (
              <div style={styles.incomeStat}>
                <span style={styles.incomeLabel}>Median</span>
                <span style={styles.incomeValue}>${data.income_median.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
