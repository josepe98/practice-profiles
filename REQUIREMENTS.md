# Practice Profiles — Product Requirements

## Vision

A lightweight internal tool for analyzing healthcare practice landscapes within a drive-time catchment area. Given a set of practices and an origin location, the app answers: *Which practices are nearby, how long does it take to reach them, and how large is the patient population in that catchment?*

Primary use case: evaluating market opportunity or competitive density in a metro area (e.g., Atlanta MSA) before opening, acquiring, or repositioning a practice.

---

## Current Features

### Practice Data Management
- Import practices from CSV or Excel (`.csv`, `.xlsx`)
- Required fields: name, address; optional: phone, # MDs, # APPs, # locations, lat/lng
- Download a blank CSV template from the app
- Auto-geocode addresses on import via Mapbox Geocoding API
- Skip geocoding for rows where lat/lng are already provided
- Re-geocode individual practices after import

### Map Visualization
- Interactive Mapbox GL JS map centered on the imported dataset
- Color-coded markers: origin (red), within filter (blue), outside filter (gray)
- Drive-time isochrone polygon overlaid on the map
- Driving route lines from origin to each in-range practice

### Origin Selection
- Click any map marker to set it as the origin practice
- Origin banner shows the selected practice name
- Search bar to find and fly to a specific practice by name

### Distance & Drive-Time Filtering
- Filter by max miles, max drive minutes, or both
- Powered by Mapbox Matrix API; batches targets in groups of 24
- Unreachable practices (null routes) are excluded from results
- Sidebar lists filtered practices sorted by distance, showing miles and drive minutes

### Catchment Population Analysis
- After applying a filter, the app fetches census tract boundaries from the Census TIGER API within the isochrone bounding box
- Each tract is intersected with the isochrone polygon using Shapely (areal interpolation)
- Tract population is weighted by `intersection_area / tract_area`
- Census ACS 5-year estimates (2022) queried per county via B01001 (Sex by Age)
- Population panel shows: total population, under-18 subtotal, and age bands (under 5, 5–9, 10–14, 15–17)
- Subtitle displays the number of census tracts included

---

## Roadmap

### Near-term
- [ ] Filter and display practices by specialty or practice type
- [ ] Show staffing summary (total MDs, APPs) for filtered practices in the sidebar
- [ ] Export filtered results to CSV (practice name, address, distance, drive time)
- [ ] Persist origin + filter settings across page refreshes (localStorage)

### Medium-term
- [ ] Expand age bands to cover the full population pyramid (0–85+)
- [ ] Side-by-side comparison mode: run two origins simultaneously, highlight overlap
- [ ] Choropleth layer: color census tracts by population density within the isochrone
- [ ] Manual practice entry form (add/edit/delete without CSV import)

### Longer-term
- [ ] Multi-origin analysis: identify underserved areas with no nearby practices
- [ ] Drive-time scoring: rank candidate sites by population coverage
- [ ] Integration with additional data sources (e.g., CMS provider data, NPPES)
- [ ] User accounts / saved scenarios
