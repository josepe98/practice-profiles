import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api.js";
import Map from "./components/Map.jsx";
import Sidebar from "./components/Sidebar.jsx";
import OriginBanner from "./components/OriginBanner.jsx";
import ImportModal from "./components/ImportModal.jsx";

const styles = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    height: 48,
    background: "#00A94F",
    color: "#fff",
    flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: 600 },
  importBtn: {
    padding: "6px 14px",
    background: "#5A5A5A",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
};

export default function App() {
  const [practices, setPractices] = useState([]);
  const [originId, setOriginId] = useState(() => {
    const s = localStorage.getItem("pf_originId");
    return s ? parseInt(s, 10) : null;
  });
  const hasAutoApplied = useRef(false);
  const [filteredResults, setFilteredResults] = useState(null); // null = no filter applied
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState(null);
  const [routesGeoJSON, setRoutesGeoJSON] = useState(null);
  const [flyToId, setFlyToId] = useState(null);
  const [populationData, setPopulationData] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchPractices = useCallback(async () => {
    try {
      const data = await api.listPractices();
      setPractices(data);
    } catch (err) {
      console.error("Failed to fetch practices:", err);
    }
  }, []);

  useEffect(() => {
    fetchPractices();
  }, [fetchPractices]);

  // Persist originId across refreshes
  useEffect(() => {
    if (originId != null) {
      localStorage.setItem("pf_originId", String(originId));
    } else {
      localStorage.removeItem("pf_originId");
    }
  }, [originId]);

  const handleOriginSelect = useCallback((id) => {
    setOriginId(id);
    setFilteredResults(null);
    setIsochroneGeoJSON(null);
    setRoutesGeoJSON(null);
    setPopulationData(null);
  }, []);

  const handleFilter = useCallback(
    async ({ maxMiles, maxMinutes }) => {
      if (!originId) return;
      setLoading(true);
      try {
        const origin = practices.find((p) => p.id === originId);
        const targetIds = practices
          .filter((p) => p.id !== originId && p.lat != null && p.lng != null)
          .map((p) => p.id);

        const [results, isochrone] = await Promise.all([
          api.getDistances(originId, targetIds),
          origin?.lat != null
            ? api.fetchIsochrone(origin.lng, origin.lat, { maxMinutes, maxMiles }).catch((err) => { console.error("Isochrone failed:", err); return null; })
            : Promise.resolve(null),
        ]);

        setIsochroneGeoJSON(isochrone);

        const filtered = results.filter((r) => {
          if (r.miles === null && r.drive_minutes === null) return false;
          if (maxMiles != null && r.miles != null && r.miles > maxMiles) return false;
          if (maxMinutes != null && r.drive_minutes != null && r.drive_minutes > maxMinutes) return false;
          return true;
        });

        // Merge with practice data
        const practiceMap = Object.fromEntries(practices.map((p) => [p.id, p]));
        const enriched = filtered
          .filter((r) => practiceMap[r.id])
          .map((r) => ({ ...practiceMap[r.id], miles: r.miles, drive_minutes: r.drive_minutes }))
          .sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity));

        setFilteredResults(enriched);

        // Fetch population data via census tract intersection with isochrone
        if (isochrone) {
          api.getPopulation(isochrone)
            .then(setPopulationData)
            .catch((err) => { console.error("Population fetch failed:", err); setPopulationData(null); });
        } else {
          setPopulationData(null);
        }

        // Fetch driving routes to all in-range practices in parallel
        const routeGeoms = await Promise.all(
          enriched.map((p) =>
            p.lat != null
              ? api.fetchRoute(origin.lng, origin.lat, p.lng, p.lat).catch(() => null)
              : Promise.resolve(null)
          )
        );
        setRoutesGeoJSON({
          type: "FeatureCollection",
          features: routeGeoms
            .filter((g) => g != null)
            .map((geometry) => ({ type: "Feature", geometry, properties: {} })),
        });
      } catch (err) {
        console.error("Distance filter failed:", err);
      } finally {
        setLoading(false);
      }
    },
    [originId, practices]
  );

  // After practices load, auto-apply saved filter if origin + filter are both stored
  useEffect(() => {
    if (!practices.length || !originId || hasAutoApplied.current) return;
    if (!practices.some((p) => p.id === originId)) return;
    const saved = localStorage.getItem("pf_filter");
    if (!saved) return;
    try {
      const filter = JSON.parse(saved);
      hasAutoApplied.current = true;
      handleFilter(filter);
    } catch {}
  }, [practices, originId, handleFilter]);

  const handleSearchSelect = useCallback((practice) => {
    setOriginId(practice.id);
    setFilteredResults(null);
    setIsochroneGeoJSON(null);
    setRoutesGeoJSON(null);
    setPopulationData(null);
    setFlyToId(practice.id);
  }, []);

  const handleImportDone = useCallback(() => {
    setShowImport(false);
    fetchPractices();
  }, [fetchPractices]);

  const origin = practices.find((p) => p.id === originId) ?? null;

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <span style={styles.title}>Practice Profiles</span>
        <button style={styles.importBtn} onClick={() => setShowImport(true)}>
          Import CSV / Excel
        </button>
      </header>

      <OriginBanner origin={origin} />

      <div style={styles.body}>
        <Map
          practices={practices}
          originId={originId}
          filteredIds={filteredResults ? new Set(filteredResults.map((r) => r.id)) : null}
          onSelectOrigin={handleOriginSelect}
          isochroneGeoJSON={isochroneGeoJSON}
          routesGeoJSON={routesGeoJSON}
          flyToId={flyToId}
        />
        <Sidebar
          practices={practices}
          originId={originId}
          filteredResults={filteredResults}
          populationData={populationData}
          loading={loading}
          onFilter={handleFilter}
          onClearFilter={() => { setFilteredResults(null); setIsochroneGeoJSON(null); setRoutesGeoJSON(null); setPopulationData(null); }}
          onSearchSelect={handleSearchSelect}
        />
      </div>

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onDone={handleImportDone} />
      )}
    </div>
  );
}
