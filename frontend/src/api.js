import { supabase } from "./supabaseClient.js";

const API_HOST = import.meta.env.VITE_API_BASE_URL || "";
const BASE = `${API_HOST}/api`;

async function request(method, path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  const opts = { method, headers };
  if (body) {
    opts.body = body instanceof FormData ? body : JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Practices
  listPractices: () => request("GET", "/practices"),
  getPractice: (id) => request("GET", `/practices/${id}`),
  createPractice: (data) => request("POST", "/practices", data),
  updatePractice: (id, data) => request("PUT", `/practices/${id}`, data),
  deletePractice: (id) => request("DELETE", `/practices/${id}`),

  // Import
  importCSV: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("POST", "/import/csv", fd);
  },
  downloadTemplate: () => {
    window.location.href = `${BASE}/import/template`;
  },

  // Distances
  getDistances: (originId, targetIds) =>
    request("POST", "/distances", { origin_id: originId, target_ids: targetIds }),

  // Population via census tract + isochrone intersection (Census ACS)
  getPopulation: (isochroneGeoJSON, overlapThreshold = 0.20) =>
    request("POST", "/population", { isochrone: isochroneGeoJSON, overlap_threshold: overlapThreshold }),

  // Census tract boundaries for visual overlay
  getTractBoundaries: (isochroneGeoJSON, overlapThreshold = 0.20) =>
    request("POST", "/tracts", { isochrone: isochroneGeoJSON, overlap_threshold: overlapThreshold }),

  // Per-tract population + income breakdown for Details tab
  getTractDetails: (isochroneGeoJSON, overlapThreshold = 0.20) =>
    request("POST", "/population/tracts", { isochrone: isochroneGeoJSON, overlap_threshold: overlapThreshold }),

  // Geocode
  geocodePractice: (id) => request("POST", `/geocode/${id}`),

  // Analytics
  triggerPrecompute: (force = false) =>
    request("POST", `/analytics/precompute?force=${force}`, {}),
  getAnalyticsStatus: () => request("GET", "/analytics/status"),
  triggerDemographicsRefresh: () => request("POST", "/analytics/precompute-demographics", {}),
  getDemographicsStatus: () => request("GET", "/analytics/demographics-status"),
  getCoverage: (affiliations) =>
    request("GET", `/analytics/coverage?affiliations=${(affiliations || []).join(",")}`),
  getDensity: () => request("GET", "/analytics/density"),

  // Patient origin datasets
  listPatientOriginDatasets: () => request("GET", "/patient-origins/datasets"),
  uploadPatientOrigins: async (practiceId, name, file) => {
    const fd = new FormData();
    fd.append("practice_id", practiceId);
    fd.append("name", name);
    fd.append("file", file);
    return request("POST", "/patient-origins/upload", fd);
  },
  getPatientOriginsGeoJSON: (datasetId) => request("GET", `/patient-origins/${datasetId}/geojson`),
  deletePatientOriginDataset: (datasetId) => request("DELETE", `/patient-origins/${datasetId}`),

  // Geocode an arbitrary address string via Mapbox (frontend token, US only)
  geocodeAddress: async (query) => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=US&proximity=-84.388,33.749&types=address,poi`
    );
    if (!res.ok) throw new Error("Geocoding request failed");
    const data = await res.json();
    if (!data.features?.length) throw new Error("Address not found");
    const [lng, lat] = data.features[0].center;
    return { lng, lat };
  },

  // Driving route geometry between two points
  fetchRoute: async (oLng, oLat, tLng, tLat) => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${oLng},${oLat};${tLng},${tLat}?geometries=geojson&access_token=${token}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.routes?.[0]?.geometry ?? null;
  },

  // Isochrone — called directly against Mapbox (token lives in the frontend)
  fetchIsochrone: async (lng, lat, { maxMinutes, maxMiles }) => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    const params = new URLSearchParams({ polygons: "true", access_token: token });
    if (maxMinutes != null) {
      params.set("contours_minutes", String(Math.round(maxMinutes)));
    } else if (maxMiles != null) {
      params.set("contours_meters", String(Math.round(maxMiles * 1609.344)));
    } else {
      return null;
    }
    const url = `https://api.mapbox.com/isochrone/v1/mapbox/driving/${lng},${lat}?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Isochrone API ${res.status}: ${text}`);
    }
    return res.json();
  },

  // Candidate locations
  listCandidates: () => request("GET", "/candidates"),
  createCandidate: (data) => request("POST", "/candidates", data),
  deleteCandidate: (id) => request("DELETE", `/candidates/${id}`),

  getTccnCompare: () => request("GET", "/tccn/compare"),
  triggerTccnScrape: () => request("POST", "/tccn/scrape"),
  addTccnExclusion: (practice_name, reason) => request("POST", "/tccn/exclusions", { practice_name, reason }),
  removeTccnExclusion: (practice_name) => request("DELETE", `/tccn/exclusions/${encodeURIComponent(practice_name)}`),
};
