const BASE = "/api";

async function request(method, path, body) {
  const opts = {
    method,
    headers: body instanceof FormData ? {} : { "Content-Type": "application/json" },
  };
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
  getPopulation: (isochroneGeoJSON) =>
    request("POST", "/population", { isochrone: isochroneGeoJSON }),

  // Geocode
  geocodePractice: (id) => request("POST", `/geocode/${id}`),

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
};
