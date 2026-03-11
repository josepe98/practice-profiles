import React, { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const COLORS = {
  origin:   "#e53e3e",
  filtered: "#2563eb",
  wellstar: "#8246AF",
  choa:     "#00A94F",
  piedmont:  "#ec5829",
  zarminali:  "#5D0D3A",
  playground: "#4e8cb7",
  default:    "#718096",
};

const FONT_SIZE   = 11;   // px — must match layer text-size
const CHAR_WIDTH  = 6.2;  // approximate px per character at FONT_SIZE
const LABEL_H     = 15;   // label height in px
const MAX_LBL_W   = 160;  // cap label width estimate
const PADDING     = 4;    // extra gap between labels in px
const DOT_R       = 10;   // space reserved around each dot centre

// Build per-label candidates. Right/left use edge-anchored dx so a wide label
// never extends back over its own dot — the left edge starts at x + DOT_R + PADDING
// (right) or the right edge ends at x - DOT_R - PADDING (left).
function buildCandidates(w) {
  const Rdx  = w / 2 + DOT_R + PADDING;   // right: left edge clears dot
  const Ldx  = -(w / 2 + DOT_R + PADDING); // left: right edge clears dot
  const Vgap = DOT_R + PADDING;            // min vertical gap from dot edge
  const mid  = -LABEL_H / 2;              // dy to vertically centre label on dot

  const cands = [];
  for (let d = 0; d <= 210; d += 14) {
    cands.push(
      // Below centre, then shifted right / left
      [0,           Vgap + d],
      [ d * 0.45,   Vgap + d],
      [-d * 0.45,   Vgap + d],
      // Above centre, then shifted right / left
      [0,          -(Vgap + d + LABEL_H)],
      [ d * 0.45,  -(Vgap + d + LABEL_H)],
      [-d * 0.45,  -(Vgap + d + LABEL_H)],
      // Right side, varying vertically
      [Rdx,  mid],
      [Rdx,  mid - d * 0.35],
      [Rdx,  mid + d * 0.35],
      // Left side, varying vertically
      [Ldx,  mid],
      [Ldx,  mid - d * 0.35],
      [Ldx,  mid + d * 0.35],
    );
  }
  return cands;
}

function computeLabelFeatures(map, practices, filteredIds, originId) {
  const hasFiltered = filteredIds && filteredIds.size > 0;
  const hasOrigin   = originId != null;
  if (!hasFiltered && !hasOrigin) return [];

  const labelIds = new Set(hasFiltered ? [...filteredIds] : []);
  if (hasOrigin) labelIds.add(originId);

  // Origin gets priority placement
  const allLabelled = practices.filter((p) => labelIds.has(p.id) && p.lat != null && p.lng != null);
  const items = [
    ...allLabelled.filter((p) => p.id === originId),
    ...allLabelled.filter((p) => p.id !== originId),
  ].map((p) => {
    const { x, y } = map.project([p.lng, p.lat]);
    const w = Math.min(p.name.length * CHAR_WIDTH, MAX_LBL_W);
    return { p, x, y, w };
  });

  // Pre-reserve a box around every dot so labels never land on a marker
  const placed = items.map(({ x, y }) => ({
    lx: x - DOT_R, ly: y - DOT_R, rx: x + DOT_R, ry: y + DOT_R,
  }));

  const hits = (lx, ly, w) =>
    placed.some((b) =>
      lx < b.rx + PADDING && (lx + w) > b.lx - PADDING &&
      ly < b.ry + PADDING && (ly + LABEL_H) > b.ly - PADDING
    );

  const features = [];

  for (const { p, x, y, w } of items) {
    const cands = buildCandidates(w);
    let chosenDx = null, chosenDy = null;

    for (const [dx, dy] of cands) {
      const lx = x + dx - w / 2;
      const ly = y + dy;
      if (!hits(lx, ly, w)) {
        chosenDx = dx;
        chosenDy = dy;
        placed.push({ lx, ly, rx: lx + w, ry: ly + LABEL_H });
        break;
      }
    }

    if (chosenDx === null) continue; // skip rather than pile on

    const offsetPt = map.unproject([x + chosenDx, y + chosenDy + LABEL_H / 2]);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [offsetPt.lng, offsetPt.lat] },
      properties: { name: p.name },
    });
  }

  return features;
}

function pickColor(id, originId, filteredIds, practiceMap) {
  if (id === originId) return COLORS.origin;
  const affiliation = (practiceMap?.[id]?.affiliation ?? "").toLowerCase();
  const isWellstar   = affiliation === "wellstar";
  const isChoa       = affiliation === "children's";
  const isPiedmont   = affiliation === "piedmont";
  const isZarminali  = affiliation === "zarminali";
  const isPlayground = affiliation.includes("playground");
  if (filteredIds != null && filteredIds.has(id)) {
    if (isWellstar)    return COLORS.wellstar;
    if (isChoa)        return COLORS.choa;
    if (isPiedmont)    return COLORS.piedmont;
    if (isZarminali)   return COLORS.zarminali;
    if (isPlayground)  return COLORS.playground;
    return COLORS.filtered;
  }
  if (isWellstar)    return COLORS.wellstar;
  if (isChoa)        return COLORS.choa;
  if (isPiedmont)    return COLORS.piedmont;
  if (isZarminali)   return COLORS.zarminali;
  if (isPlayground)  return COLORS.playground;
  return COLORS.default;
}

export default function Map({ practices, originId, filteredIds, hiddenAffiliations, showHighways, onSelectOrigin, onMapClick, customOrigin, densityGeoJSON, showDensity, isochroneGeoJSON, routesGeoJSON, tractGeoJSON, flyToId, fitAllTrigger }) {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const markerMapRef   = useRef({});
  // Refs so event listeners always see current values without re-binding
  const filteredIdsRef     = useRef(filteredIds);
  const practicesRef       = useRef(practices);
  const originIdRef        = useRef(originId);
  const isochroneGeoJSONRef = useRef(isochroneGeoJSON);
  const routesGeoJSONRef    = useRef(routesGeoJSON);
  const tractGeoJSONRef        = useRef(tractGeoJSON);
  const hiddenAffiliationsRef  = useRef(hiddenAffiliations);
  const showHighwaysRef        = useRef(showHighways);
  const onMapClickRef          = useRef(onMapClick);
  const densityGeoJSONRef      = useRef(densityGeoJSON);
  const customPinMarkerRef     = useRef(null);

  useEffect(() => { filteredIdsRef.current      = filteredIds;      }, [filteredIds]);
  useEffect(() => { practicesRef.current        = practices;        }, [practices]);
  useEffect(() => { originIdRef.current         = originId;         }, [originId]);
  useEffect(() => { isochroneGeoJSONRef.current = isochroneGeoJSON; }, [isochroneGeoJSON]);
  useEffect(() => { routesGeoJSONRef.current    = routesGeoJSON;    }, [routesGeoJSON]);
  useEffect(() => { tractGeoJSONRef.current        = tractGeoJSON;        }, [tractGeoJSON]);
  useEffect(() => { hiddenAffiliationsRef.current  = hiddenAffiliations;  }, [hiddenAffiliations]);
  useEffect(() => { showHighwaysRef.current        = showHighways;        }, [showHighways]);
  useEffect(() => { onMapClickRef.current          = onMapClick;          }, [onMapClick]);
  useEffect(() => { densityGeoJSONRef.current      = densityGeoJSON;      }, [densityGeoJSON]);

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
    const savedView = (() => { try { const s = sessionStorage.getItem("pf_mapView"); return s ? JSON.parse(s) : null; } catch { return null; } })();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: savedView?.center ?? [-84.388, 33.749],
      zoom:   savedView?.zoom   ?? 9,
    });

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

      // Highway highlight — sits below all custom layers
      map.addLayer({
        id: "highway-highlight",
        type: "line",
        source: "composite",
        "source-layer": "road",
        filter: ["in", "class", "motorway", "motorway_link", "trunk", "trunk_link"],
        layout: {
          "line-cap": "round",
          "line-join": "round",
          "visibility": showHighwaysRef.current ? "visible" : "none",
        },
        paint: {
          "line-color": "#f59e0b",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 6],
          "line-opacity": 0.7,
        },
      });

      // Highway shield labels — visible at metro zoom, tied to highway toggle
      map.addLayer({
        id: "highway-labels",
        type: "symbol",
        source: "composite",
        "source-layer": "road",
        filter: ["in", "class", "motorway", "trunk"],
        minzoom: 8,
        layout: {
          "visibility": showHighwaysRef.current ? "visible" : "none",
          "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "ref"], ["get", "name_en"]],
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 12, 14, 16],
          "text-rotation-alignment": "viewport",
          "text-allow-overlap": false,
          "symbol-spacing": 500,
          "text-max-angle": 40,
        },
        paint: {
          "text-color": "#1a202c",
          "text-halo-color": "#fff",
          "text-halo-width": 2,
        },
      });

      map.addSource("density", { type: "geojson", data: empty });
      map.addLayer({
        id: "density-fill", type: "fill", source: "density",
        layout: { "visibility": "none" },
        paint: {
          "fill-color": [
            "interpolate", ["linear"], ["get", "kids_per_sqmi"],
            0,    "#f7fbff",
            200,  "#c6dbef",
            500,  "#6baed6",
            1000, "#2171b5",
            2000, "#08306b",
          ],
          "fill-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "density-outline", type: "line", source: "density",
        layout: { "visibility": "none" },
        paint: { "line-color": "#4a5568", "line-width": 0.5, "line-opacity": 0.5 },
      });

      map.addSource("isochrone", { type: "geojson", data: empty });
      map.addLayer({ id: "isochrone-fill", type: "fill", source: "isochrone",
        paint: { "fill-color": "#4f8ef7", "fill-opacity": 0.18 } });
      map.addLayer({ id: "isochrone-line", type: "line", source: "isochrone",
        paint: { "line-color": "#4f8ef7", "line-width": 2, "line-opacity": 0.7 } });

      map.addSource("routes", { type: "geojson", data: empty });
      map.addLayer({ id: "routes-line", type: "line", source: "routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#00A94F", "line-width": 2, "line-opacity": 0.5 } });

      map.addSource("tracts", { type: "geojson", data: empty });
      map.addLayer({ id: "tracts-line", type: "line", source: "tracts",
        paint: { "line-color": "#6b46c1", "line-width": 1, "line-opacity": 0.7 } });

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
      map.on("moveend", () => {
        try {
          const c = map.getCenter();
          sessionStorage.setItem("pf_mapView", JSON.stringify({ center: [c.lng, c.lat], zoom: map.getZoom() }));
        } catch {}
        refreshLabels();
      });
      map.on("zoomend", refreshLabels);

      // Click on empty map space to drop a custom pin
      map.on("click", (e) => {
        onMapClickRef.current?.(e.lngLat);
      });

      // Re-add sources/layers and re-apply data after WebGL context loss + restoration.
      // After context recovery Mapbox clears programmatically-added sources, so we
      // must re-add them before calling setData.
      map.on("style.load", () => {
        const empty = { type: "FeatureCollection", features: [] };

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
              "visibility": showHighwaysRef.current ? "visible" : "none",
            },
            paint: {
              "line-color": "#f59e0b",
              "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 6],
              "line-opacity": 0.7,
            },
          });
        }

        if (!map.getLayer("highway-labels")) {
          map.addLayer({
            id: "highway-labels",
            type: "symbol",
            source: "composite",
            "source-layer": "road",
            filter: ["in", "class", "motorway", "trunk"],
            minzoom: 8,
            layout: {
              "visibility": showHighwaysRef.current ? "visible" : "none",
              "symbol-placement": "line",
              "text-field": ["coalesce", ["get", "ref"], ["get", "name_en"]],
              "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 8, 12, 14, 16],
              "text-rotation-alignment": "viewport",
              "text-allow-overlap": false,
              "symbol-spacing": 500,
              "text-max-angle": 40,
            },
            paint: {
              "text-color": "#1a202c",
              "text-halo-color": "#fff",
              "text-halo-width": 2,
            },
          });
        }

        if (!map.getSource("density")) {
          map.addSource("density", { type: "geojson", data: empty });
          map.addLayer({
            id: "density-fill", type: "fill", source: "density",
            layout: { "visibility": "none" },
            paint: {
              "fill-color": [
                "interpolate", ["linear"], ["get", "kids_per_sqmi"],
                0, "#f7fbff", 200, "#c6dbef", 500, "#6baed6", 1000, "#2171b5", 2000, "#08306b",
              ],
              "fill-opacity": 0.55,
            },
          });
          map.addLayer({
            id: "density-outline", type: "line", source: "density",
            layout: { "visibility": "none" },
            paint: { "line-color": "#4a5568", "line-width": 0.5, "line-opacity": 0.5 },
          });
        }

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

        if (!map.getSource("tracts")) {
          map.addSource("tracts", { type: "geojson", data: empty });
          map.addLayer({ id: "tracts-line", type: "line", source: "tracts",
            paint: { "line-color": "#6b46c1", "line-width": 1, "line-opacity": 0.7 } });
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

        const den = map.getSource("density");
        const iso = map.getSource("isochrone");
        const rts = map.getSource("routes");
        const trc = map.getSource("tracts");
        if (den) den.setData(densityGeoJSONRef.current ?? empty);
        if (iso) iso.setData(isochroneGeoJSONRef.current ?? empty);
        if (rts) rts.setData(routesGeoJSONRef.current  ?? empty);
        if (trc) trc.setData(tractGeoJSONRef.current   ?? empty);
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

      const practiceMap = Object.fromEntries(practices.map((p) => [p.id, p]));

      for (const p of practices) {
        if (p.lat == null || p.lng == null || existing[p.id]) continue;

        const el = document.createElement("div");
        const aff = p.affiliation ?? "";
        el.style.cssText = `width:14px;height:14px;cursor:pointer;${hiddenAffiliationsRef.current.has(aff) ? "display:none;" : ""}`;

        const dot = document.createElement("div");
        dot.style.cssText = `
          width:14px; height:14px;
          background:${pickColor(p.id, originIdRef.current, filteredIdsRef.current, practiceMap)};
          border-radius:50%;
          border:2px solid #fff;
          box-shadow:0 1px 4px rgba(0,0,0,0.3);
          transition:transform 0.15s;
        `;
        el.appendChild(dot);

        el.addEventListener("mouseenter", () => {
          dot.style.transform = "scale(1.4)";
          if (!marker.getPopup()?.isOpen()) marker.togglePopup();
        });
        el.addEventListener("mouseleave", () => {
          dot.style.transform = "";
          if (marker.getPopup()?.isOpen()) marker.togglePopup();
        });
        el.addEventListener("click",      (e) => { e.stopPropagation(); onSelectOrigin(p.id); });

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
    const practiceMap = Object.fromEntries(practicesRef.current.map((p) => [p.id, p]));
    for (const [idStr, { dot }] of Object.entries(markerMapRef.current)) {
      dot.style.background = pickColor(Number(idStr), originId, filteredIds, practiceMap);
    }
  }, [originId, filteredIds, practices]);

  // Show/hide markers based on affiliation visibility toggles
  useEffect(() => {
    const practiceMap = Object.fromEntries(practicesRef.current.map((p) => [p.id, p]));
    for (const [idStr, { marker }] of Object.entries(markerMapRef.current)) {
      const aff = practiceMap[Number(idStr)]?.affiliation ?? "";
      marker.getElement().style.display = hiddenAffiliations.has(aff) ? "none" : "";
    }
  }, [hiddenAffiliations, practices]);

  // Toggle highway highlight layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vis = showHighways ? "visible" : "none";
    const update = () => {
      if (map.getLayer("highway-highlight"))
        map.setLayoutProperty("highway-highlight", "visibility", vis);
      if (map.getLayer("highway-labels"))
        map.setLayoutProperty("highway-labels", "visibility", vis);
    };
    if (map.getLayer("highway-highlight")) update();
    else map.once("load", update);
  }, [showHighways]);

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

  // Fit map to all practice markers
  useEffect(() => {
    if (!fitAllTrigger) return;
    const map = mapRef.current;
    if (!map) return;
    const bounds = new mapboxgl.LngLatBounds();
    practicesRef.current.forEach(p => {
      if (p.lat != null && p.lng != null) bounds.extend([p.lng, p.lat]);
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 800 });
  }, [fitAllTrigger]);

  // Update isochrone and fit map to its bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const empty = { type: "FeatureCollection", features: [] };
    const update = () => {
      const s = map.getSource("isochrone");
      if (!s) return;
      s.setData(isochroneGeoJSON ?? empty);
      if (isochroneGeoJSON?.features?.length) {
        const geom = isochroneGeoJSON.features[0]?.geometry;
        if (geom) {
          const bounds = new mapboxgl.LngLatBounds();
          const rings = geom.type === "Polygon" ? geom.coordinates
            : geom.type === "MultiPolygon" ? geom.coordinates.flatMap((p) => p)
            : [];
          rings.forEach((ring) => ring.forEach((pt) => bounds.extend(pt)));
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 800 });
        }
      }
    };
    if (map.getSource("isochrone")) update(); else map.once("load", update);
  }, [isochroneGeoJSON]);

  // Update census tract overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const empty = { type: "FeatureCollection", features: [] };
    const update = () => { const s = map.getSource("tracts"); if (s) s.setData(tractGeoJSON ?? empty); };
    if (map.getSource("tracts")) update(); else map.once("load", update);
  }, [tractGeoJSON]);

  // Update density choropleth data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const empty = { type: "FeatureCollection", features: [] };
    const update = () => { const s = map.getSource("density"); if (s) s.setData(densityGeoJSON ?? empty); };
    if (map.getSource("density")) update(); else map.once("load", update);
  }, [densityGeoJSON]);

  // Toggle density layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vis = showDensity ? "visible" : "none";
    const update = () => {
      if (map.getLayer("density-fill")) map.setLayoutProperty("density-fill", "visibility", vis);
      if (map.getLayer("density-outline")) map.setLayoutProperty("density-outline", "visibility", vis);
    };
    if (map.getLayer("density-fill")) update(); else map.once("load", update);
  }, [showDensity]);

  // Manage custom pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (customOrigin) {
      if (customPinMarkerRef.current) {
        customPinMarkerRef.current.setLngLat([customOrigin.lng, customOrigin.lat]);
      } else {
        const el = document.createElement("div");
        el.style.cssText = "width:24px;height:24px;cursor:pointer;";
        const dot = document.createElement("div");
        dot.style.cssText = `
          width:24px; height:24px;
          background:#e53e3e; border:3px solid #fff;
          border-radius:50%; box-shadow:0 2px 8px rgba(0,0,0,0.3);
        `;
        el.appendChild(dot);
        el.addEventListener("click", (e) => e.stopPropagation());
        customPinMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([customOrigin.lng, customOrigin.lat])
          .addTo(map);
      }
    } else if (customPinMarkerRef.current) {
      customPinMarkerRef.current.remove();
      customPinMarkerRef.current = null;
    }
  }, [customOrigin]);

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
