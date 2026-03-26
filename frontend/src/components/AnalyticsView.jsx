import React, { useState, useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { api } from "../api.js";
import AnalyticsControls from "./AnalyticsControls.jsx";
import AnalyticsResults from "./AnalyticsResults.jsx";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const EMPTY_FC = { type: "FeatureCollection", features: [] };

function addSourceAndLayers(map, data) {
  if (!map.getSource("analytics-tracts")) {
    map.addSource("analytics-tracts", {
      type: "geojson",
      data: data || EMPTY_FC,
      promoteId: "geoid",
    });
  } else if (data) {
    map.getSource("analytics-tracts").setData(data);
  }
  if (!map.getLayer("tracts-fill")) {
    map.addLayer({
      id: "tracts-fill",
      type: "fill",
      source: "analytics-tracts",
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "nearest_minutes"], null], "#cccccc",
          ["step", ["get", "nearest_minutes"],
            "#1a9641", 10, "#a6d96a", 15, "#ffffbf", 20, "#fdae61", 30, "#d7191c"],
        ],
        "fill-opacity": 0.7,
      },
    });
  }
  if (!map.getLayer("tracts-outline")) {
    map.addLayer({
      id: "tracts-outline",
      type: "line",
      source: "analytics-tracts",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "is_gap"], false], "#e53e3e",
          "rgba(0,0,0,0.15)",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "is_gap"], false], 2.5, 0.5,
        ],
      },
    });
  }
  if (!map.getLayer("highway-highlight")) {
    map.addLayer({
      id: "highway-highlight",
      type: "line",
      source: "composite",
      "source-layer": "road",
      filter: ["in", "class", "motorway", "motorway_link", "trunk", "trunk_link"],
      layout: {
        "line-cap": "round",
        "line-join": "round",
        visibility: "none",
      },
      paint: {
        "line-color": "#4a5568",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 6],
        "line-opacity": 0.7,
      },
    });
  }
}

export default function AnalyticsView({ onClose }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const coverageGeoJSONRef = useRef(null);

  const [status, setStatus] = useState({
    running: false, done: false, step: "", progress: 0, total: 0,
    last_run: null, tract_count: 0, practice_count: 0,
  });
  const [demoStatus, setDemoStatus] = useState({
    running: false, done: false, step: "", progress: 0, total: 0,
    last_run: null, tract_count: 0,
  });
  const [loading, setLoading] = useState(false);
  const [showHighways, setShowHighways] = useState(false);

  // Init map
  useEffect(() => {
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-84.39, 33.75],
      zoom: 9,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.once("load", () => {
      addSourceAndLayers(map, coverageGeoJSONRef.current);
    });

    // Re-add on style reload (WebGL context loss recovery)
    map.on("style.load", () => {
      addSourceAndLayers(map, coverageGeoJSONRef.current);
    });

    return () => map.remove();
  }, []);

  // Fetch initial status
  useEffect(() => {
    api.getAnalyticsStatus().then(setStatus).catch(() => {});
    api.getDemographicsStatus().then(setDemoStatus).catch(() => {});
  }, []);

  // Poll while running
  useEffect(() => {
    if (!status.running) return;
    const id = setInterval(async () => {
      const s = await api.getAnalyticsStatus().catch(() => null);
      if (s) {
        setStatus(s);
        if (!s.running) clearInterval(id);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [status.running]);

  // Poll demographics while running
  useEffect(() => {
    if (!demoStatus.running) return;
    const id = setInterval(async () => {
      const s = await api.getDemographicsStatus().catch(() => null);
      if (s) {
        setDemoStatus(s);
        if (!s.running) clearInterval(id);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [demoStatus.running]);

  // Toggle highway highlight layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      if (map.getLayer("highway-highlight"))
        map.setLayoutProperty("highway-highlight", "visibility", showHighways ? "visible" : "none");
    };
    if (map.getSource("analytics-tracts")) update();
    else map.once("load", update);
  }, [showHighways]);

  const handleRunPrecompute = useCallback(async (force = false) => {
    try {
      await api.triggerPrecompute(force);
      const s = await api.getAnalyticsStatus().catch(() => null);
      if (s) setStatus(s);
    } catch (e) {
      console.error("Trigger precompute failed:", e);
    }
  }, []);

  const handleRefreshDemographics = useCallback(async () => {
    try {
      await api.triggerDemographicsRefresh();
      const s = await api.getDemographicsStatus().catch(() => null);
      if (s) setDemoStatus(s);
    } catch (e) {
      console.error("Trigger demographics refresh failed:", e);
    }
  }, []);

  const applyGeoJSONToMap = useCallback((geojson) => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      if (map.getSource("analytics-tracts")) {
        map.getSource("analytics-tracts").setData(geojson);
      } else {
        addSourceAndLayers(map, geojson);
      }
    };
    if (map.getSource("analytics-tracts")) update();
    else map.once("load", update);
  }, []);

  const handleUpdateCoverage = useCallback(async (affiliations) => {
    setLoading(true);
    try {
      const geojson = await api.getCoverage(affiliations);
      coverageGeoJSONRef.current = geojson;
      applyGeoJSONToMap(geojson);
    } catch (e) {
      console.error("Coverage fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [applyGeoJSONToMap]);


  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", height: 44, borderBottom: "1px solid #e2e8f0",
        background: "#f7fafc", flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#2d3748" }}>
          Analytics — Coverage Map
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#718096", lineHeight: 1, padding: "0 4px" }}
        >
          ×
        </button>
      </div>

      {/* Three-panel body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: Controls */}
        <div style={{ width: 280, borderRight: "1px solid #e2e8f0", overflowY: "auto", flexShrink: 0, background: "#fafafa" }}>
          <AnalyticsControls
            status={status}
            demoStatus={demoStatus}
            onRunPrecompute={handleRunPrecompute}
            onRefreshDemographics={handleRefreshDemographics}
            onUpdateCoverage={handleUpdateCoverage}
            loading={loading}
            showHighways={showHighways}
            onToggleHighways={() => setShowHighways((v) => !v)}
          />
        </div>

        {/* Center: Map */}
        <div ref={mapContainerRef} style={{ flex: 1, minWidth: 0 }} />

        {/* Right: Legend */}
        <div style={{ width: 300, borderLeft: "1px solid #e2e8f0", overflowY: "auto", flexShrink: 0, background: "#fafafa" }}>
          <AnalyticsResults />
        </div>
      </div>
    </div>
  );
}
