import React, { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const COLORS = {
  origin:   "#e53e3e",
  filtered: "#f97316",
  default:  "#718096",
};

const FONT_SIZE   = 11;   // px — must match layer text-size
const CHAR_WIDTH  = 6.2;  // approximate px per character at FONT_SIZE
const LABEL_H     = 15;   // label height in px
const MAX_LBL_W   = 160;  // cap label width estimate
const PADDING     = 3;    // extra gap between labels in px

// Candidate offsets (dx, dy in px from dot centre) tried in order.
// dy is measured from top of label box, so negative = label sits above.
function candidates(startDist) {
  const results = [];
  for (let d = startDist; d <= 120; d += startDist) {
    results.push(
      [0,  d],                        // below
      [0, -(d + LABEL_H)],            // above
      [d,  0],                        // right
      [-d,  0],                       // left
      [d,  d],                        // below-right
      [-d,  d],                       // below-left
      [d, -(d + LABEL_H)],            // above-right
      [-d, -(d + LABEL_H)],           // above-left
    );
  }
  return results;
}

function computeLabelFeatures(map, practices, filteredIds, originId) {
  const hasFiltered = filteredIds && filteredIds.size > 0;
  const hasOrigin   = originId != null;
  if (!hasFiltered && !hasOrigin) return [];

  const INITIAL = 10;

  const labelIds = new Set(hasFiltered ? [...filteredIds] : []);
  if (hasOrigin) labelIds.add(originId);

  const items = practices
    .filter((p) => labelIds.has(p.id) && p.lat != null && p.lng != null)
    .map((p) => {
      const { x, y } = map.project([p.lng, p.lat]);
      const w = Math.min(p.name.length * CHAR_WIDTH, MAX_LBL_W);
      return { p, x, y, w };
    });

  const placed = [];

  return items.map(({ p, x, y, w }) => {
    let chosenDx = 0, chosenDy = INITIAL;

    for (const [dx, dy] of candidates(INITIAL)) {
      const lx = x + dx - w / 2;
      const ly = y + dy;
      const overlaps = placed.some(
        (b) => lx < b.rx + PADDING && (lx + w) > b.lx - PADDING &&
               ly < b.ry + PADDING && (ly + LABEL_H) > b.ly - PADDING
      );
      if (!overlaps) {
        chosenDx = dx;
        chosenDy = dy;
        placed.push({ lx, ly, rx: lx + w, ry: ly + LABEL_H });
        break;
      }
    }

    // Offset the geometry point so Mapbox renders the label at the computed position.
    // This avoids needing data-driven text-offset (not supported in this way by Mapbox GL JS).
    const offsetPt = map.unproject([x + chosenDx, y + chosenDy + LABEL_H / 2]);

    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [offsetPt.lng, offsetPt.lat] },
      properties: { name: p.name },
    };
  });
}

function pickColor(id, originId, filteredIds) {
  if (id === originId) return COLORS.origin;
  if (filteredIds != null && filteredIds.has(id)) return COLORS.filtered;
  return COLORS.default;
}

export default function Map({ practices, originId, filteredIds, onSelectOrigin, isochroneGeoJSON, routesGeoJSON, flyToId }) {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const markerMapRef   = useRef({});
  // Refs so event listeners always see current values without re-binding
  const filteredIdsRef     = useRef(filteredIds);
  const practicesRef       = useRef(practices);
  const originIdRef        = useRef(originId);
  const isochroneGeoJSONRef = useRef(isochroneGeoJSON);
  const routesGeoJSONRef    = useRef(routesGeoJSON);

  useEffect(() => { filteredIdsRef.current      = filteredIds;      }, [filteredIds]);
  useEffect(() => { practicesRef.current        = practices;        }, [practices]);
  useEffect(() => { originIdRef.current         = originId;         }, [originId]);
  useEffect(() => { isochroneGeoJSONRef.current = isochroneGeoJSON; }, [isochroneGeoJSON]);
  useEffect(() => { routesGeoJSONRef.current    = routesGeoJSON;    }, [routesGeoJSON]);

  // Stable function — reads from refs, safe to use as map event listener
  const refreshLabels = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("labels");
    if (!source) return;
    const features = computeLabelFeatures(map, practicesRef.current, filteredIdsRef.current, originIdRef.current);
    source.setData({ type: "FeatureCollection", features });
  }, []);

  // Init map once
  useEffect(() => {
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-84.388, 33.749],
      zoom: 9,
    });
    map.addControl(new mapboxgl.NavigationControl({ showZoom: false }), "top-right");

    const style = document.createElement("style");
    style.textContent = `
      .practice-popup .mapboxgl-popup-content {
        background: rgba(255,255,255,0.5);
        padding: 6px 10px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      }
      .practice-popup.mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: rgba(255,255,255,0.5); }
      .practice-popup.mapboxgl-popup-anchor-top    .mapboxgl-popup-tip { border-bottom-color: rgba(255,255,255,0.5); }
      .practice-popup.mapboxgl-popup-anchor-left   .mapboxgl-popup-tip { border-right-color: rgba(255,255,255,0.5); }
      .practice-popup.mapboxgl-popup-anchor-right  .mapboxgl-popup-tip { border-left-color: rgba(255,255,255,0.5); }
    `;
    document.head.appendChild(style);
    mapRef.current = map;

    map.once("load", () => {
      const empty = { type: "FeatureCollection", features: [] };

      map.addSource("isochrone", { type: "geojson", data: empty });
      map.addLayer({ id: "isochrone-fill", type: "fill", source: "isochrone",
        paint: { "fill-color": "#4f8ef7", "fill-opacity": 0.18 } });
      map.addLayer({ id: "isochrone-line", type: "line", source: "isochrone",
        paint: { "line-color": "#4f8ef7", "line-width": 2, "line-opacity": 0.7 } });

      map.addSource("routes", { type: "geojson", data: empty });
      map.addLayer({ id: "routes-line", type: "line", source: "routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#00A94F", "line-width": 2, "line-opacity": 0.5 } });

      // Labels: collision handled by us, not Mapbox
      map.addSource("labels", { type: "geojson", data: empty });
      map.addLayer({
        id: "practice-labels",
        type: "symbol",
        source: "labels",
        layout: {
          "text-field": ["get", "name"],
          "text-size": FONT_SIZE,
          "text-anchor": "center",  // geometry point is already the label centre
          "text-max-width": MAX_LBL_W / FONT_SIZE,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#2d3748",
          "text-halo-color": "rgba(255,255,255,0.9)",
          "text-halo-width": 1.5,
        },
      });

      // Recompute label positions after every pan/zoom
      map.on("moveend", refreshLabels);
      map.on("zoomend", refreshLabels);

      // Re-add sources/layers and re-apply data after WebGL context loss + restoration.
      // After context recovery Mapbox clears programmatically-added sources, so we
      // must re-add them before calling setData.
      map.on("style.load", () => {
        const empty = { type: "FeatureCollection", features: [] };

        if (!map.getSource("isochrone")) {
          map.addSource("isochrone", { type: "geojson", data: empty });
          map.addLayer({ id: "isochrone-fill", type: "fill", source: "isochrone",
            paint: { "fill-color": "#4f8ef7", "fill-opacity": 0.18 } });
          map.addLayer({ id: "isochrone-line", type: "line", source: "isochrone",
            paint: { "line-color": "#4f8ef7", "line-width": 2, "line-opacity": 0.7 } });
        }

        if (!map.getSource("routes")) {
          map.addSource("routes", { type: "geojson", data: empty });
          map.addLayer({ id: "routes-line", type: "line", source: "routes",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#00A94F", "line-width": 2, "line-opacity": 0.5 } });
        }

        if (!map.getSource("labels")) {
          map.addSource("labels", { type: "geojson", data: empty });
          map.addLayer({
            id: "practice-labels", type: "symbol", source: "labels",
            layout: {
              "text-field": ["get", "name"], "text-size": FONT_SIZE,
              "text-anchor": "center", "text-max-width": MAX_LBL_W / FONT_SIZE,
              "text-allow-overlap": true, "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#2d3748",
              "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.5,
            },
          });
        }

        const iso = map.getSource("isochrone");
        const rts = map.getSource("routes");
        if (iso) iso.setData(isochroneGeoJSONRef.current ?? empty);
        if (rts) rts.setData(routesGeoJSONRef.current  ?? empty);
        refreshLabels();
      });
    });

    return () => {
      map.remove();
      markerMapRef.current = {};
    };
  }, [refreshLabels]);

  // Add / remove markers when practices list changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncMarkers = () => {
      const existing = markerMapRef.current;
      const newIds = new Set(practices.filter((p) => p.lat != null).map((p) => p.id));

      for (const id of Object.keys(existing)) {
        if (!newIds.has(Number(id))) { existing[id].marker.remove(); delete existing[id]; }
      }

      for (const p of practices) {
        if (p.lat == null || p.lng == null || existing[p.id]) continue;

        const el = document.createElement("div");
        el.style.cssText = "width:14px;height:14px;cursor:pointer;";

        const dot = document.createElement("div");
        dot.style.cssText = `
          width:14px; height:14px;
          background:${COLORS.default};
          border-radius:50%;
          border:2px solid #fff;
          box-shadow:0 1px 4px rgba(0,0,0,0.3);
          transition:transform 0.15s;
        `;
        el.appendChild(dot);

        el.addEventListener("mouseenter", () => { dot.style.transform = "scale(1.4)"; });
        el.addEventListener("mouseleave", () => { dot.style.transform = ""; });
        el.addEventListener("click",      () => onSelectOrigin(p.id));

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 12, closeButton: false, className: "practice-popup" })
              .setHTML(p.name)
          )
          .addTo(map);

        existing[p.id] = { marker, dot };
      }
    };

    if (map.isStyleLoaded()) syncMarkers();
    else map.once("load", syncMarkers);
  }, [practices, onSelectOrigin]);

  // Update marker colours in-place
  useEffect(() => {
    for (const [idStr, { dot }] of Object.entries(markerMapRef.current)) {
      dot.style.background = pickColor(Number(idStr), originId, filteredIds);
    }
  }, [originId, filteredIds]);

  // Recompute labels whenever the filtered set or origin changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource("labels")) refreshLabels();
    else map.once("load", refreshLabels);
  }, [filteredIds, originId, practices, refreshLabels]);

  // Update driving routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const empty = { type: "FeatureCollection", features: [] };
    const update = () => { const s = map.getSource("routes"); if (s) s.setData(routesGeoJSON ?? empty); };
    if (map.getSource("routes")) update(); else map.once("load", update);
  }, [routesGeoJSON]);

  // Fly to practice selected via search
  useEffect(() => {
    if (!flyToId) return;
    const map = mapRef.current;
    const p = practices.find((p) => p.id === flyToId);
    if (!map || !p?.lat) return;
    map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 12), duration: 800 });
  }, [flyToId, practices]);

  // Update isochrone
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const empty = { type: "FeatureCollection", features: [] };
    const update = () => { const s = map.getSource("isochrone"); if (s) s.setData(isochroneGeoJSON ?? empty); };
    if (map.getSource("isochrone")) update(); else map.once("load", update);
  }, [isochroneGeoJSON]);

  const zoom = (delta) => {
    const map = mapRef.current;
    if (map) map.zoomTo(map.getZoom() + delta, { duration: 200 });
  };

  const btnStyle = {
    width: 30, height: 30,
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.2)",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 18,
    lineHeight: "28px",
    textAlign: "center",
    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
    userSelect: "none",
  };

  return (
    <div style={{ position: "relative", flex: 1, height: "100%", minWidth: 0 }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", top: 10, right: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        <button style={btnStyle} onClick={() => zoom(0.5)} title="Zoom in">+</button>
        <button style={btnStyle} onClick={() => zoom(-0.5)} title="Zoom out">−</button>
      </div>
    </div>
  );
}
