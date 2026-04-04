import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "./api.js";
import { supabase } from "./supabaseClient.js";
import LoginPage from "./components/LoginPage.jsx";
import ResetPasswordForm from "./components/ResetPasswordForm.jsx";
import Map from "./components/Map.jsx";
import Sidebar from "./components/Sidebar.jsx";
import OriginBanner from "./components/OriginBanner.jsx";
import ImportModal from "./components/ImportModal.jsx";
import PatientOriginsModal from "./components/PatientOriginsModal.jsx";
import TableView from "./components/TableView.jsx";
import TractDetailsPanel from "./components/TractDetailsPanel.jsx";
import AnalyticsView from "./components/AnalyticsView.jsx";
import TccnCompareView from "./components/TccnCompareView.jsx";
import AddPracticeModal from "./components/AddPracticeModal.jsx";

function TractDetailView({ tracts }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "#fff" }}>
      <div style={{ padding: "9px 16px", borderBottom: "1px solid #e2e8f0", background: "#f7fafc", fontSize: 12, fontWeight: 600, color: "#4a5568", flexShrink: 0 }}>
        {tracts?.length ?? 0} census tract{tracts?.length !== 1 ? "s" : ""} — population &amp; income breakdown
      </div>
      <TractDetailsPanel tracts={tracts} />
    </div>
  );
}

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

function affiliationColor(affiliation) {
  const aff = (affiliation ?? "").toLowerCase();
  if (aff === "wellstar") return "#8246AF";
  if (aff === "children's") return "#00A94F";
  if (aff === "piedmont") return "#ec5829";
  if (aff === "zarminali") return "#5D0D3A";
  if (aff.includes("playground")) return "#4e8cb7";
  if (aff === "aylo health") return "#F26628";
  return "#4a5568";
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsResettingPassword(true);
        setSession(s);
        setAuthLoading(false);
        return;
      }
      if (event === "USER_UPDATED") {
        setIsResettingPassword(false);
      }
      setSession(s);
      if (s?.access_token && event === "SIGNED_IN") {
        const apiBase = import.meta.env.VITE_API_BASE_URL || "";
        fetch(`${apiBase}/api/auth/login-event`, {
          method: "POST",
          headers: { Authorization: `Bearer ${s.access_token}` },
        }).catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const [practices, setPractices] = useState([]);
  const [originId, setOriginId] = useState(() => {
    const s = sessionStorage.getItem("pf_originId");
    return s ? parseInt(s, 10) : null;
  });
  const hasAutoApplied = useRef(false);
  const hasInitialFit  = useRef(false);
  const [filteredResults, setFilteredResults] = useState(null); // null = no filter applied
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState(null);
  const [routesGeoJSON, setRoutesGeoJSON] = useState(null);
  const [flyToId, setFlyToId] = useState(null);
  const [populationData, setPopulationData] = useState(null);
  const [tractDetails, setTractDetails] = useState(null);
  const [tractGeoJSON, setTractGeoJSON] = useState(null);
  const [showTracts, setShowTracts] = useState(false);
  const [overlapThreshold, setOverlapThreshold] = useState(0.20);
  const [hiddenAffiliations, setHiddenAffiliations] = useState(new Set());
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showHighways, setShowHighways] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [sidebarTractDetail, setSidebarTractDetail] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showTccnCompare, setShowTccnCompare] = useState(false);
  const [lastFilter, setLastFilter] = useState({ maxMinutes: 10 });
  const [customOrigin, setCustomOrigin] = useState(null); // {lng, lat} or null
  const [densityGeoJSON, setDensityGeoJSON] = useState(null);
  const [showDensity, setShowDensity] = useState(false);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const [patientOriginDatasets, setPatientOriginDatasets] = useState([]);
  const [selectedPatientDatasetId, setSelectedPatientDatasetId] = useState(null);
  const [patientOriginsGeoJSON, setPatientOriginsGeoJSON] = useState(null);
  const [showPatientOrigins, setShowPatientOrigins] = useState(true);
  const [showPatientOriginsModal, setShowPatientOriginsModal] = useState(false);

  const [candidatePOIs, setCandidatePOIs] = useState([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [showAddPracticeModal, setShowAddPracticeModal] = useState(false);

  const fetchCandidates = useCallback(async () => {
    try {
      const data = await api.listCandidates();
      setCandidatePOIs(data);
    } catch (err) {
      console.error("Failed to fetch candidates:", err);
    }
  }, []);

  useEffect(() => { if (!session) return; fetchCandidates(); }, [fetchCandidates, session]);

  const handleRemoveCandidate = useCallback(async (id) => {
    try {
      await api.deleteCandidate(id);
      setCandidatePOIs((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete candidate:", err);
    }
  }, []);

  const handleClearCandidates = useCallback(async () => {
    if (!window.confirm("Remove all candidate locations?")) return;
    try {
      await Promise.all(candidatePOIs.map((c) => api.deleteCandidate(c.id)));
      setCandidatePOIs([]);
    } catch (err) {
      console.error("Failed to clear candidates:", err);
    }
  }, [candidatePOIs]);

  const handleAddCandidateByAddress = useCallback(async (name, address, practiceId, notes, url) => {
    const { lng, lat } = await api.geocodeAddress(address);
    const candidate = await api.createCandidate({
      name: name.trim() || address,
      address,
      lng,
      lat,
      practice_id: practiceId,
      notes: notes || null,
      url: url || null,
    });
    setCandidatePOIs((prev) => [...prev, candidate]);
  }, []);

  const handleCreatePractice = useCallback(async () => {
    await fetchPractices();
  }, [fetchPractices]);

  const fetchPatientOriginDatasets = useCallback(async () => {
    try {
      const data = await api.listPatientOriginDatasets();
      setPatientOriginDatasets(data);
    } catch (err) {
      console.error("Failed to fetch patient origin datasets:", err);
    }
  }, []);

  useEffect(() => { if (!session) return; fetchPatientOriginDatasets(); }, [fetchPatientOriginDatasets, session]);

  // Fetch GeoJSON whenever selected dataset changes
  useEffect(() => {
    if (!selectedPatientDatasetId) { setPatientOriginsGeoJSON(null); return; }
    api.getPatientOriginsGeoJSON(selectedPatientDatasetId)
      .then(setPatientOriginsGeoJSON)
      .catch((err) => { console.error("Patient origins GeoJSON failed:", err); setPatientOriginsGeoJSON(null); });
  }, [selectedPatientDatasetId]);

  const fetchPractices = useCallback(async () => {
    try {
      const data = await api.listPractices();
      setPractices(data);
    } catch (err) {
      console.error("Failed to fetch practices:", err);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchPractices();
  }, [fetchPractices, session]);

  // Practices visible on the map/sidebar — excludes permanently hidden affiliations
  const HIDDEN = new Set(["Wellstar Peds Specialty"]);
  const visiblePractices = useMemo(
    () => practices.filter((p) => !HIDDEN.has(p.affiliation ?? "")),
    [practices]
  );

  const PILL_EXCLUDED = new Set(["De Novo"]);
  const affiliations = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const p of visiblePractices) {
      const aff = p.affiliation ?? "";
      if (aff && !seen.has(aff) && !PILL_EXCLUDED.has(aff)) { seen.add(aff); result.push(aff); }
    }
    const ORDER = ["Children's", "TCCN", "Piedmont", "Wellstar", "Wellstar Peds Specialty"];
    return result.sort((a, b) => {
      const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [visiblePractices]);

  const toggleAffiliation = useCallback((aff) => {
    setHiddenAffiliations((prev) => {
      const next = new Set(prev);
      if (next.has(aff)) next.delete(aff); else next.add(aff);
      return next;
    });
  }, []);

  const displayedResults = useMemo(() => {
    if (!filteredResults) return null;
    if (hiddenAffiliations.size === 0) return filteredResults;
    return filteredResults.filter((p) => !hiddenAffiliations.has(p.affiliation ?? ""));
  }, [filteredResults, hiddenAffiliations]);

  // Persist originId across refreshes
  useEffect(() => {
    if (originId != null) {
      sessionStorage.setItem("pf_originId", String(originId));
    } else {
      sessionStorage.removeItem("pf_originId");
    }
  }, [originId]);

  // Fetch isochrone + population for a practice with a given filter — shared by
  // auto-fetch on marker click and explicit Apply.
  const fetchCatchment = useCallback(async (practice, filter) => {
    if (!practice?.lat) return;
    try {
      const isochrone = await api.fetchIsochrone(practice.lng, practice.lat, filter)
        .catch((err) => { console.error("Isochrone failed:", err); return null; });
      setIsochroneGeoJSON(isochrone);
      if (isochrone) {
        api.getPopulation(isochrone, overlapThreshold)
          .then(setPopulationData)
          .catch(() => setPopulationData(null));
        api.getTractDetails(isochrone, overlapThreshold)
          .then(setTractDetails)
          .catch(() => setTractDetails(null));
      } else {
        setPopulationData(null);
        setTractDetails(null);
      }
    } catch (err) {
      console.error("fetchCatchment failed:", err);
    }
  }, [overlapThreshold]);

  const handleOriginSelect = useCallback((id) => {
    setAddingCandidateMode(false);
    setOriginId(id);
    setCustomOrigin(null);
    setFilteredResults(null);
    setIsochroneGeoJSON(null);
    setRoutesGeoJSON(null);
    setPopulationData(null);
    setTractDetails(null);
    setTractGeoJSON(null);
    setShowTracts(false);
    const practice = visiblePractices.find((p) => p.id === id);
    fetchCatchment(practice, lastFilter);
  }, [visiblePractices, lastFilter, fetchCatchment]);

  const handleMapClick = useCallback((lngLat) => {
    const { lng, lat } = lngLat;
    setCustomOrigin({ lng, lat });
    setOriginId(null);
    setFilteredResults(null);
    setIsochroneGeoJSON(null);
    setRoutesGeoJSON(null);
    setPopulationData(null);
    setTractDetails(null);
    setTractGeoJSON(null);
    setShowTracts(false);
    fetchCatchment({ lng, lat }, lastFilter);
  }, [lastFilter, fetchCatchment]);

  const handleFilter = useCallback(
    async ({ maxMiles, maxMinutes }) => {
      if (!originId && !customOrigin) return;
      setLoading(true);
      const newFilter = { maxMiles, maxMinutes };
      setLastFilter(newFilter);
      try {
        const origin = customOrigin ?? visiblePractices.find((p) => p.id === originId);
        const originLng = origin?.lng;
        const originLat = origin?.lat;

        // For custom pins, only fetch isochrone + population (no distance matrix)
        if (customOrigin) {
          const isochrone = originLat != null
            ? await api.fetchIsochrone(originLng, originLat, { maxMinutes, maxMiles }).catch((err) => { console.error("Isochrone failed:", err); return null; })
            : null;
          setIsochroneGeoJSON(isochrone);
          setFilteredResults(null);
          setRoutesGeoJSON(null);
          if (isochrone) {
            api.getPopulation(isochrone, overlapThreshold)
              .then(setPopulationData)
              .catch((err) => { console.error("Population fetch failed:", err); setPopulationData(null); });
            api.getTractDetails(isochrone, overlapThreshold)
              .then(setTractDetails)
              .catch((err) => { console.error("Tract details fetch failed:", err); setTractDetails(null); });
          } else {
            setPopulationData(null);
            setTractDetails(null);
          }
          return;
        }

        const targetIds = visiblePractices
          .filter((p) => p.id !== originId && p.lat != null && p.lng != null)
          .map((p) => p.id);

        const [results, isochrone] = await Promise.all([
          api.getDistances(originId, targetIds),
          originLat != null
            ? api.fetchIsochrone(originLng, originLat, { maxMinutes, maxMiles }).catch((err) => { console.error("Isochrone failed:", err); return null; })
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
        const practiceMap = Object.fromEntries(visiblePractices.map((p) => [p.id, p]));
        const enriched = filtered
          .filter((r) => practiceMap[r.id])
          .map((r) => ({ ...practiceMap[r.id], miles: r.miles, drive_minutes: r.drive_minutes }))
          .sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity));

        setFilteredResults(enriched);

        // Fetch population data + per-tract details via census tract intersection with isochrone
        if (isochrone) {
          api.getPopulation(isochrone, overlapThreshold)
            .then(setPopulationData)
            .catch((err) => { console.error("Population fetch failed:", err); setPopulationData(null); });
          api.getTractDetails(isochrone, overlapThreshold)
            .then(setTractDetails)
            .catch((err) => { console.error("Tract details fetch failed:", err); setTractDetails(null); });
        } else {
          setPopulationData(null);
          setTractDetails(null);
        }

        // Fetch driving routes to all in-range practices in parallel
        const routeGeoms = await Promise.all(
          enriched.map((p) =>
            p.lat != null
              ? api.fetchRoute(originLng, originLat, p.lng, p.lat).catch(() => null)
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
    [originId, customOrigin, visiblePractices, overlapThreshold]
  );

  // On first practice load, fit map to show all markers
  useEffect(() => {
    if (!practices.length || hasInitialFit.current) return;
    hasInitialFit.current = true;
    setFitAllTrigger(n => n + 1);
  }, [practices]);

  // After practices load, restore session state: apply saved filter or at least
  // fetch catchment data so population shows immediately for the saved origin.
  useEffect(() => {
    if (!visiblePractices.length || !originId || hasAutoApplied.current) return;
    if (!visiblePractices.some((p) => p.id === originId)) return;
    hasAutoApplied.current = true;
    const saved = sessionStorage.getItem("pf_filter");
    if (saved) {
      try { handleFilter(JSON.parse(saved)); } catch {}
    } else {
      const practice = visiblePractices.find((p) => p.id === originId);
      fetchCatchment(practice, lastFilter);
    }
  }, [visiblePractices, originId, handleFilter, fetchCatchment, lastFilter]);

  const handleSearchSelect = useCallback((practice) => {
    setOriginId(practice.id);
    setCustomOrigin(null);
    setFilteredResults(null);
    setIsochroneGeoJSON(null);
    setRoutesGeoJSON(null);
    setPopulationData(null);
    setTractDetails(null);
    setTractGeoJSON(null);
    setShowTracts(false);
    setFlyToId(practice.id);
    fetchCatchment(practice, lastFilter);
  }, [lastFilter, fetchCatchment]);

  const handleToggleTracts = useCallback(async () => {
    if (showTracts) {
      setShowTracts(false);
      setTractGeoJSON(null);
    } else if (isochroneGeoJSON) {
      try {
        const geojson = await api.getTractBoundaries(isochroneGeoJSON, overlapThreshold);
        setTractGeoJSON(geojson);
        setShowTracts(true);
      } catch (err) {
        console.error("Tract boundary fetch failed:", err);
      }
    }
  }, [showTracts, isochroneGeoJSON, overlapThreshold]);

  const handleThresholdChange = useCallback(async (newThreshold) => {
    setOverlapThreshold(newThreshold);
    if (!isochroneGeoJSON) return;

    const promises = [];

    if (showTracts) {
      promises.push(
        api.getTractBoundaries(isochroneGeoJSON, newThreshold)
          .then(setTractGeoJSON)
          .catch((err) => console.error("Tract boundary fetch failed:", err))
      );
    }

    promises.push(
      api.getPopulation(isochroneGeoJSON, newThreshold)
        .then(setPopulationData)
        .catch((err) => { console.error("Population fetch failed:", err); setPopulationData(null); })
    );
    promises.push(
      api.getTractDetails(isochroneGeoJSON, newThreshold)
        .then(setTractDetails)
        .catch((err) => { console.error("Tract details fetch failed:", err); setTractDetails(null); })
    );

    await Promise.all(promises);
  }, [showTracts, isochroneGeoJSON]);

  // Close tract detail panel when its data is no longer available
  useEffect(() => {
    if (!tractDetails) { setSidebarTractDetail(false); }
  }, [tractDetails]);

  const handleImportDone = useCallback(() => {
    setShowImport(false);
    fetchPractices();
  }, [fetchPractices]);

  const handleToggleDensity = useCallback(async () => {
    if (showDensity) {
      setShowDensity(false);
      return;
    }
    if (densityGeoJSON) {
      setShowDensity(true);
      return;
    }
    try {
      const data = await api.getDensity();
      setDensityGeoJSON(data);
      setShowDensity(true);
    } catch (err) {
      console.error("Density fetch failed:", err);
    }
  }, [showDensity, densityGeoJSON]);

  const origin = visiblePractices.find((p) => p.id === originId) ?? null;
  const hasOrigin = origin != null || customOrigin != null;

  if (authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#718096", fontSize: 14 }}>
        Loading…
      </div>
    );
  }
  if (!session) return <LoginPage />;
  if (isResettingPassword) return <ResetPasswordForm />;

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <span style={styles.title}>Practice Profiles</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {affiliations.map((aff) => {
            const isHidden = hiddenAffiliations.has(aff);
            return (
              <button
                key={aff}
                onClick={() => toggleAffiliation(aff)}
                title={isHidden ? `Show ${aff}` : `Hide ${aff}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 10px",
                  borderRadius: 12,
                  border: "none",
                  background: "rgba(255,255,255,0.9)",
                  color: "#2d3748",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  opacity: isHidden ? 0.4 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: isHidden ? "#cbd5e0" : affiliationColor(aff),
                }} />
                {aff}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Views */}
          {session?.user?.email === "erik.josephson@choa.org" && (
            <button
              style={{ ...styles.importBtn, background: showAnalytics ? "#2d6a4f" : "#5A5A5A" }}
              onClick={() => { setShowAnalytics(v => !v); setShowTable(false); setShowTccnCompare(false); }}
            >
              {showAnalytics ? "← Map" : "Analytics"}
            </button>
          )}
          <button
            style={{ ...styles.importBtn, background: showTable ? "#2d6a4f" : "#5A5A5A" }}
            onClick={() => { setShowTable(v => !v); setShowAnalytics(false); setShowTccnCompare(false); }}
          >
            {showTable ? "← Map" : "Practice Table"}
          </button>
          {session?.user?.email === "erik.josephson@choa.org" && (
            <button
              style={{ ...styles.importBtn, background: showTccnCompare ? "#2d6a4f" : "#5A5A5A" }}
              onClick={() => { setShowTccnCompare(v => !v); setShowTable(false); setShowAnalytics(false); }}
            >
              {showTccnCompare ? "← Map" : "TCCN Compare"}
            </button>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.3)", margin: "0 4px" }} />

          {/* Data actions */}
          <button style={styles.importBtn} onClick={() => setShowPatientOriginsModal(true)}>
            Patient Origins
          </button>
          <button style={styles.importBtn} onClick={() => setShowImport(true)}>
            Import
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.3)", margin: "0 4px" }} />

          <button
            style={{ ...styles.importBtn, background: "rgba(255,255,255,0.15)" }}
            onClick={() => supabase.auth.signOut()}
            title={session?.user?.email}
          >
            Sign out
          </button>
        </div>
      </header>

      <OriginBanner origin={origin} customOrigin={customOrigin} onClearCustomOrigin={() => { setCustomOrigin(null); setIsochroneGeoJSON(null); setPopulationData(null); setTractDetails(null); setTractGeoJSON(null); setShowTracts(false); }} />

      <div style={styles.body}>
        {showAnalytics ? (
          <AnalyticsView onClose={() => setShowAnalytics(false)} />
        ) : showTccnCompare ? (
          <TccnCompareView />
        ) : showTable ? (
          <TableView practices={practices} onRefresh={fetchPractices} />
        ) : sidebarTractDetail ? (
          <TractDetailView tracts={tractDetails} />
        ) : (
          <>
            <Map
              practices={visiblePractices}
              originId={originId}
              filteredIds={displayedResults ? new Set(displayedResults.map((r) => r.id)) : null}
              hiddenAffiliations={hiddenAffiliations}
              showHighways={showHighways}
              onSelectOrigin={handleOriginSelect}
              onMapClick={handleMapClick}
              customOrigin={customOrigin}
              isochroneGeoJSON={isochroneGeoJSON}
              routesGeoJSON={routesGeoJSON}
              tractGeoJSON={tractGeoJSON}
              densityGeoJSON={densityGeoJSON}
              showDensity={showDensity}
              flyToId={flyToId}
              fitAllTrigger={fitAllTrigger}
              candidatePOIs={candidatePOIs}
              showCandidates={showCandidates}
              onRemoveCandidate={handleRemoveCandidate}
              patientOriginsGeoJSON={patientOriginsGeoJSON}
              showPatientOrigins={showPatientOrigins}
            />
            <Sidebar
              practices={visiblePractices}
              originId={originId}
              customOrigin={customOrigin}
              filteredResults={displayedResults}
              populationData={populationData}
              showTracts={showTracts}
              onToggleTracts={handleToggleTracts}
              overlapThreshold={overlapThreshold}
              onThresholdChange={handleThresholdChange}
              loading={loading}
              onFilter={handleFilter}
              onClearFilter={() => { setOriginId(null); setCustomOrigin(null); setFilteredResults(null); setIsochroneGeoJSON(null); setRoutesGeoJSON(null); setPopulationData(null); setTractDetails(null); setTractGeoJSON(null); setShowTracts(false); setFitAllTrigger(n => n + 1); }}
              onSearchSelect={handleSearchSelect}
              showHighways={showHighways}
              onToggleHighways={() => setShowHighways((v) => !v)}
              showDensity={showDensity}
              onToggleDensity={handleToggleDensity}
              candidatePOIs={candidatePOIs}
              showCandidates={showCandidates}
              onToggleCandidates={() => setShowCandidates((v) => !v)}
              onClearCandidates={handleClearCandidates}
              onRemoveCandidate={handleRemoveCandidate}
              onAddCandidateByAddress={handleAddCandidateByAddress}
              onOpenAddPractice={() => setShowAddPracticeModal(true)}
              patientOriginDatasets={patientOriginDatasets}
              selectedPatientDatasetId={selectedPatientDatasetId}
              onSelectPatientDataset={(id) => { setSelectedPatientDatasetId(id); setShowPatientOrigins(true); }}
              showPatientOrigins={showPatientOrigins}
              onTogglePatientOrigins={() => setShowPatientOrigins((v) => !v)}
              showTractDetail={sidebarTractDetail}
              onToggleTractDetail={() => setSidebarTractDetail((v) => !v)}
            />

          </>
        )}
      </div>

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onDone={handleImportDone} />
      )}
      {showPatientOriginsModal && (
        <PatientOriginsModal
          practices={visiblePractices}
          datasets={patientOriginDatasets}
          onClose={() => setShowPatientOriginsModal(false)}
          onRefresh={fetchPatientOriginDatasets}
        />
      )}
      {showAddPracticeModal && (
        <AddPracticeModal
          onClose={() => setShowAddPracticeModal(false)}
          onCreated={handleCreatePractice}
        />
      )}
    </div>
  );
}
