# Practice Profiles — Requirements

## Purpose

An internal strategic tool for Children's Healthcare of Atlanta (CHOA) / The Children's Care Network (TCCN) to:

1. Visualize the pediatric primary care landscape across Metro Atlanta
2. Analyze catchment areas and population coverage for existing practices
3. Identify market gaps — underserved populations not well served by CHOA/TCCN

The app tracks both own-network practices (Children's, TCCN) and competitor practices (Wellstar, Piedmont) to support network planning and expansion decisions.

---

## Competitive Context

| Affiliation | Relationship | Strategic posture |
|---|---|---|
| Children's / TCCN | Own network | Primary planning unit |
| Wellstar | Primary competitor | Aggressive pediatric expansion; direct threat to own-network market share end-to-end |
| Piedmont | Secondary competitor / partial partner | Smaller pediatric footprint; refers complex cases to CHOA hospitals; lower urgency |
| Wellstar Peds Specialty | Competitor (tracked, hidden from map) | Specialty competitor; tracked in DB but de-emphasized in UI |

---

## Data Sources

How practice data for each affiliation was originally obtained:

| Affiliation | Source | Method | Notes |
|---|---|---|---|
| TCCN | `tccn-choa.org/provider-directory` | Automated scraper (`backend/scrape_tccn.py`) | Server-rendered, paginated — scrapes cleanly. Re-scrape available via UI. |
| Wellstar | Wellstar website | Unknown — likely scraped in a prior Claude session | Result saved as `wellstar_pediatrics.csv` in repo root; imported into DB (42 practices). Phone numbers and coordinates were missing from CSV and geocoded separately. |
| Piedmont | `care.piedmont.org/locations/` | Screenshots read by Claude | Site uses Qwik SPA with client-side-only pagination; automated scraping only retrieved page 1 (20 of 76 locations). Remainder entered manually from screenshots. Research scripts in `.firecrawl/scratchpad/`. |
| Children's | "Strategy Google Map" | Manual entry from a lightly-maintained internal Google Map | Believed to be complete and correct but source is not systematically updated. |
| Playground Pediatrics | `playgroundpediatrics.com/our-practices` | Automated scraper (`test-folder/georgia_checker.py`) | Georgia locations only; monitored weekly for changes. |
| Zarminali | `zarminali.com/locations` | Automated scraper (`test-folder/georgia_checker.py`) | Georgia locations only; monitored weekly for changes. |

### Refreshing data

- **TCCN**: Use the "Re-scrape directory" button in the TCCN Compare tab.
- **Wellstar / Piedmont**: No automated refresh path exists. Wellstar would need a scraper built; Piedmont likely requires the batch detail-page approach documented in `.firecrawl/scratchpad/` (firecrawl map → batch individual practice pages).
- **Children's**: Check the "Strategy Google Map" for updates and manually enter any changes via the app.

---

## Tech Stack

- **Backend**: Python 3.11 + FastAPI + SQLAlchemy
- **Frontend**: React + Vite + Mapbox GL JS
- **Routing**: Mapbox Matrix API (drive times + distances, batched in groups of 24)
- **Geocoding**: Mapbox Geocoding API
- **Isochrones**: Mapbox Isochrone API
- **Population data**: US Census ACS 5-year estimates (B01001 age by sex, B19013 median HH income, B19001 HH income brackets)
- **Tract boundaries**: Census TIGER/Web API (ACS 2022, MapServer layer 8)
- **Database**: Supabase PostgreSQL (transaction pooler, port 6543)

### Deployment
- **Backend**: Railway → `https://practice-profiles-production.up.railway.app`
- **Frontend**: Vercel → `https://practice-profiles.vercel.app`
- There is no local running instance. SQLite support has been removed.

### Development workflow
- **Frontend changes**: Run `npm run dev` in `frontend/` — the dev server talks directly to the Railway backend. No local backend needed.
- **Backend changes**: Edit code locally, push to main, Railway redeploys automatically. There is no staging environment; be deliberate about backend changes before pushing.
- **DATABASE_URL is required**: The backend will not start without it. Set it in your environment or `.env` file pointing to Supabase.

---

## Study Area

**Atlanta-Sandy Springs-Alpharetta, GA MSA** (official OMB definition) — 29 Georgia counties:

Barrow, Bartow, Butts, Carroll, Cherokee, Clayton, Cobb, Coweta, Dawson, DeKalb, Douglas, Fayette, Forsyth, Fulton, Gwinnett, Haralson, Heard, Henry, Jasper, Lamar, Meriwether, Morgan, Newton, Paulding, Pickens, Pike, Rockdale, Spalding, Walton

Approximately 1,200 census tracts.

---

## Data Model

### `practices` table

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto |
| name | TEXT | Practice name |
| address | TEXT | Full address |
| phone | TEXT | Optional |
| num_mds | INTEGER | MD/DO provider count |
| num_apps | INTEGER | APP (NP/PA) count |
| num_locations | INTEGER | Default 1 |
| lat / lng | REAL | Geocoded by Mapbox |
| geocoded | INTEGER | 0/1 flag |
| affiliation | TEXT | Children's, TCCN, Wellstar, Piedmont, Wellstar Peds Specialty |
| ownership | TEXT | Who owns/operates the practice (separate from clinical affiliation) |
| is_de_novo | BOOLEAN | True for candidate/de novo practices not yet opened |
| created_at / updated_at | TEXT | Timestamps |

### `candidate_locations` table

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto |
| name | TEXT | Location name / label |
| address | TEXT | Street address |
| lng / lat | REAL | Geocoded coordinates (nullable) |
| practice_id | INTEGER FK | Associated practice (→ practices.id) |
| notes | TEXT | Optional freeform notes |
| url | TEXT | Optional reference URL |
| created_at | DATETIME | UTC timestamp |

### `tract_demographics` table *(analytics precompute)*

| Column | Type | Notes |
|---|---|---|
| geoid | TEXT PK | Census tract GEOID (11-digit) |
| lat / lng | REAL | Tract centroid |
| state_fips | TEXT | e.g. "13" (Georgia) |
| county_fips | TEXT | e.g. "121" (Fulton) |
| total_pop | INTEGER | ACS total population |
| under_18 | INTEGER | Sum of under-18 age bands |
| under_5 | INTEGER | Under-5 population |
| income_median | INTEGER | Median household income |

### `tract_distances` table *(analytics precompute)*

| Column | Type | Notes |
|---|---|---|
| geoid | TEXT | → tract_demographics.geoid |
| practice_id | INTEGER | → practices.id |
| miles | REAL | Drive distance |
| drive_minutes | REAL | Drive time via Mapbox Matrix |
| PRIMARY KEY | (geoid, practice_id) | |

---

## API Endpoints

### Existing

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/practices` | List all practices |
| GET | `/api/practices/{id}` | Single practice |
| POST | `/api/practices` | Create practice |
| PUT | `/api/practices/{id}` | Update practice |
| DELETE | `/api/practices/{id}` | Delete practice |
| POST | `/api/import/csv` | Upload CSV/Excel, geocode, bulk insert |
| GET | `/api/import/template` | Download blank CSV template |
| POST | `/api/distances` | Origin + targets → miles + drive_minutes |
| POST | `/api/geocode/{id}` | Re-geocode a practice |
| POST | `/api/isochrone` | Origin + filter → isochrone polygon (GeoJSON) |
| POST | `/api/population` | Isochrone → weighted population by census tract |
| POST | `/api/population/tracts` | Isochrone → per-tract population + income breakdown |
| POST | `/api/tracts` | Isochrone → census tract boundary GeoJSON for visual overlay |
| GET | `/api/candidates` | List all candidate locations |
| POST | `/api/candidates` | Create candidate location |
| DELETE | `/api/candidates/{id}` | Delete candidate location |
| GET | `/api/patient-origins/datasets` | List patient origin datasets |
| POST | `/api/patient-origins/upload` | Upload patient origin CSV (practice_id, name, file) |
| GET | `/api/patient-origins/{id}/geojson` | GeoJSON for a patient origin dataset |
| DELETE | `/api/patient-origins/{id}` | Delete a patient origin dataset |
| GET | `/api/tccn/compare` | Compare TCCN directory vs DB practices |
| POST | `/api/tccn/scrape` | Re-scrape TCCN provider directory |
| POST | `/api/tccn/exclusions` | Add a TCCN comparison exclusion |
| DELETE | `/api/tccn/exclusions/{name}` | Remove a TCCN comparison exclusion |
| POST | `/api/analytics/precompute` | Batch job: fetch MSA tracts → ACS demographics → Mapbox distances → store |
| GET | `/api/analytics/status` | Precompute status, last run timestamp, tract count |
| POST | `/api/analytics/precompute-demographics` | Refresh Census demographics only (no drive-time compute) |
| GET | `/api/analytics/demographics-status` | Demographics precompute status |
| GET | `/api/analytics/coverage` | Per-tract: nearest practice drive time + affiliation (heat map) |
| GET | `/api/analytics/density` | Practice density by tract |

---

## Views / UI

### Map View (default)

- Mapbox GL JS map centered on Metro Atlanta
- Practice markers colored by affiliation (see Affiliation Colors below)
- Wellstar Peds Specialty hidden from map (kept in DB)
- Affiliation toggle pills in header (show/hide markers by affiliation); custom sort order: Children's → TCCN → Piedmont → Wellstar → Wellstar Peds Specialty
- Click marker → auto-fetches 15-min drive isochrone + population data (default; updates to match last-used filter)
- Filter bar: max miles or max drive minutes → apply filter
- Isochrone polygon drawn on map; map zooms to fit polygon
- Census tract overlay (toggleable) with adjustable overlap threshold (20/40/60/80/100%)
- Hover over any marker → popup shows practice name
- Session state (selected origin, filter, map view) stored in sessionStorage; new browser tab starts fresh at fit-all zoom

### Sidebar (map view)

- Search bar (find practice by name, flies to marker)
- Filter bar (miles / drive minutes / apply / clear; state persisted in sessionStorage)
- Highway highlight toggle
- Population panel (when isochrone active):
  - Total population in catchment + census tract count
  - Age bands: under 5, 5–9, 10–14, 15–17
  - Household income: weighted avg + median
- Practice list:
  - Origin card (shown immediately on marker click)
  - Filtered nearby practices with affiliation pill badges, sorted by distance
  - Empty states: prompt to click marker / set filter as appropriate
- Census tract toggle + overlap threshold selector (visible when population data loaded)

### Practice Table

- Full-screen editable table of all practices (including hidden affiliations)
- Inline editing: name, address, phone, num_mds, num_apps, affiliation
- Add new practice → new row scrolls into view; auto-geocodes if no lat/lng provided
- Delete practice
- Monospace font (11px), compact rows matching Tract Detail table style

### Tract Detail

- Full-screen sortable table of per-tract data for the currently active isochrone
- Visible only when tract detail data is loaded (button appears in header)
- Columns (55px fixed width where noted): Tract GEOID, Pop by Age Census Table (B01001 link), HH Income Census Table (B19013 link), Overlap % (55px), Total (55px), <5 (55px), 5–9 (55px), 10–14 (55px), 15–17 (55px), Median Income
- Column headers wrap text, 48px row height, vertically bottom-aligned, left-justified

### Candidate Locations (sidebar panel)

- Toggle "Show pins" to display candidate location markers on the map (purple rounded-square markers)
- "Labels" checkbox (next to "Show pins"): forces all candidate labels always-visible for screenshots
- Add candidate form: name, address, associated practice (required), notes, URL
- Candidate list with linked practice name and remove button
- "Add Practice" button opens a modal to create a new practice (including de novo)

### Analytics View *(Phase 1 implemented)*

A dedicated full-screen view for market gap analysis, separate from the practice-catchment workflow. Accessed via header button.

#### Layout

```
┌──────────────┬──────────────────────────────────┬───────────────┐
│ Controls     │   Map (tract heat map)            │ Results       │
│              │                                  │               │
│ Analysis:    │   - Tracts colored by metric     │ Ranked list   │
│ ○ Coverage   │   - Gap clusters highlighted     │ of gaps /     │
│ ○ Gap Finder │   - Color scale legend           │ tracts        │
│ ○ Whitespace │                                  │               │
│ ○ Prov. Ratio│                                  │ Click → drill │
│              │                                  │   down        │
│ Thresholds   │                                  │               │
│ Affil. filter│                                  │               │
│              │                                  │               │
│ [Run]        │                                  │               │
│              │                                  │               │
│ Precompute   │                                  │               │
│ [status]     │                                  │               │
└──────────────┴──────────────────────────────────┴───────────────┘
```

#### Precompute step

All analytics depend on a one-time batch job (and re-run when practices change):

1. Fetch all ~1,200 census tract centroids in the 29-county MSA from TIGER API
2. Fetch ACS demographics per tract (population by age, median income)
3. For each tract centroid, compute drive time + distance to each practice via Mapbox Matrix (batched; skip pairs with straight-line distance >10 miles — 25 mi caused 2-hour runs)
4. Store results in `tract_demographics` and `tract_distances` tables

Demographics refresh (free, Census only) and full drive-time precompute are separate operations. UI shows: precompute buttons, last-run timestamp, tract count, practice count at time of last run.

#### Analysis 1: Coverage heat map *(Phase 1)*

Color each census tract by drive time to the nearest practice of the selected affiliation(s). Shows geographic access deserts visually. Affiliation filter allows showing coverage by own network only, competitor only, or all.

#### Analysis 2: Gap finder *(Phase 1)*

User sets thresholds:
- Minimum pediatric population (under 18) in gap cluster
- Maximum acceptable drive time or miles to nearest practice
- Which affiliations count as "coverage"

Output: ranked list of underserved census tracts or contiguous clusters, sorted by pediatric population.

Example: "Which single tract or small cluster has ≥5,000 kids with no Children's/TCCN practice within 5 miles?"

Gap interpretation varies by affiliation filter:

| Nearest practice | Strategic read |
|---|---|
| No practice at all | True access desert — community health / CON argument |
| Wellstar only, no Children's/TCCN | High-priority competitive threat |
| Piedmont only, no Children's/TCCN | Lower urgency (referral relationship softens risk) |
| Both Wellstar + Piedmont, no Children's/TCCN | Contested market; Children's absent |

#### Analysis 3: Affiliation white-space *(Phase 2)*

Per-tract coverage breakdown by affiliation. Identifies where Wellstar is dominant and Children's/TCCN is absent — the highest-priority competitive expansion targets.

#### Analysis 4: Provider ratio *(Phase 2)*

Kids per provider (MD + APP) in each tract's effective catchment. Flags tracts where a practice exists nearby but is likely over-capacity. Informs both competitor weakness and own-network capacity planning.

#### Analysis 5: Optimal new location *(Phase 3)*

Grid search over Metro Atlanta: for each candidate lat/lng, compute how much currently underserved pediatric population would be within a 15-min drive. Ranks candidate locations by population impact. Answers: "If we were to open one new practice, where should it be?"

---

## Affiliation Colors

### Pills (sidebar, header badges)

| Affiliation | Background | Text |
|---|---|---|
| Children's | `#e6f4ee` | `#166534` |
| TCCN | `#166534` | `#e6f4ee` (inverse of Children's) |
| Piedmont | `#fef0eb` | `#9a3412` |
| Wellstar | `#f3ebfa` | `#6b21a8` |
| Other | `#edf2f7` | `#4a5568` |

### Map markers

| Affiliation | Color | Notes |
|---|---|---|
| Children's / TCCN | `#00A94F` | CHOA green |
| Wellstar | `#8246AF` | Wellstar purple, Pantone 2587C |
| Piedmont | `#ec5829` | Piedmont orange-red |
| Zarminali | `#5D0D3A` | Deep plum (from zarminali.com) |
| Playground | `#4e8cb7` | Darker blue (from playgroundpediatrics.com) |
| Aylo Health | `#F26628` | Aylo orange; marker has serif "a" label to distinguish from Piedmont |
| De Novo | `#805ad5` | Purple; rounded-square marker shape (not circle) |
| Other | `#718096` | Gray |
| Origin (selected) | `#e53e3e` | Red |
| In-range (filtered) | `#2563eb` | Blue |

### Brand color reference

| Organization | Hex | Source |
|---|---|---|
| CHOA (Children's) | `#00A94F` (green), `#5A5A5A` (gray) | CHOA brand guidelines |
| Wellstar | `#8246AF` | Pantone 2587C |
| Piedmont | `#ec5829` | brandfetch.com/piedmonthospital.org |
| Zarminali | `#5D0D3A` | zarminali.com footer |
| Playground | `#4e8cb7` | playgroundpediatrics.com darkAccent HSL |
| Aylo Health | `#F26628` (primary), `#E7510E` (hover/dark variant) | aylohealth.com SVG fills |

---

## Data Sourcing

### Current approach
Practice data is manually transcribed from health system websites and entered via CSV import or the Practice Table UI. This is labor-intensive but reliable.

### Automated scraping — feasibility assessment (2026-03-12)

Attempted automated extraction of pediatric practice locations from **Piedmont Healthcare** (care.piedmont.org/locations/) and **Nimble**. Both attempts failed to produce complete results.

**Why it's hard:** Major health systems use heavy SPA frameworks (Qwik, React) where:
- Filtering and pagination are client-side JS only — URL parameters don't apply filters
- No public REST APIs (internal APIs require session cookies)
- Browser automation times out on remote Chromium sessions before pagination completes
- Serialized page data (e.g., Qwik JSON) is opaque and impractical to decode

**Partial success:** Page 1 of Piedmont (20 of 76 pediatric locations) was extractable via JSON-LD structured data (`@type: MedicalBusiness`). Individual practice detail pages are also scrapeable but require one API call per location.

**Sites likely to be scrapeable:**
- Server-rendered HTML or Next.js SSR
- URL-based pagination (`?page=2`)
- Discoverable REST/GraphQL APIs
- JSON-LD structured data on listing pages

**Sites likely to resist scraping:**
- Heavy SPA frameworks with client-side-only filtering/pagination
- Session-gated APIs
- Infinite scroll without URL pagination
- Bot detection (Cloudflare, CAPTCHAs)

**Viable approach (not yet implemented):** Replicate Google's indexing strategy:
1. Use `firecrawl map` to discover all practice detail page URLs (already done — found 191 URLs for Piedmont)
2. Batch-scrape each individual detail page (each is simple and renders cleanly)
3. Filter for pages mentioning the target specialty (e.g., "Pediatrics")
4. Extract name, address, phone from each matching page

This bypasses the problematic listing page pagination entirely. Cost: ~1 firecrawl credit per practice page. The approach is repeatable for future data refreshes.

**Recommendation:** Continue manual data entry for now. The Google-like approach above is the most promising automation path when the cost/benefit justifies it (e.g., refreshing data across multiple health systems).

---

## Authentication

All access is gated behind Supabase Auth. There is no public registration — accounts are created by an admin via the Supabase dashboard.

### Login flow
- Email + password only (`supabase.auth.signInWithPassword`)
- Session managed by Supabase client (JWT + refresh token stored in `localStorage`)
- JWT validated by the backend on every request via `Authorization: Bearer` header
- Login events recorded in `user_logins` table (user_id, email, timestamp)

### Forgot password flow
1. User clicks "Forgot password?" on the login page and submits their email
2. Frontend calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })`
3. Supabase emails a one-time reset link
4. User clicks the link → redirected back to the app with a `PASSWORD_RECOVERY` token in the URL hash
5. App detects the `PASSWORD_RECOVERY` event in `onAuthStateChange` and renders `ResetPasswordForm`
6. User sets a new password via `supabase.auth.updateUser({ password })`
7. On success, `USER_UPDATED` fires and the user is dropped into the main app

### User management
- Accounts created in Supabase dashboard → Authentication → Users → Invite user
- Invite emails a magic link; user is authenticated on first click but must use "Forgot password?" to set a password before logging out
- No self-service registration or admin UI within the app

### Session persistence
- Active users stay logged in indefinitely via automatic JWT refresh
- After extended inactivity (refresh token expiry, configurable in Supabase), users must log in again via password or the forgot-password flow

---

## Known Constraints / Gotchas

- **Python 3.9**: use `from __future__ import annotations` + `typing` module; no `X | Y` union syntax or `list[X]` at runtime
- **Mapbox Matrix**: max 25 coordinates per request (1 source + 24 destinations); batch accordingly
- **Mapbox Isochrone**: profile=`driving`, contours_minutes param; returns GeoJSON FeatureCollection
- **TIGER API**: may return tracts from multiple states if bounding box crosses state line
- **Shapely**: use `.area` for overlap ratios (degree² units consistent for ratio calculations)
- **Map source readiness**: always gate source updates on `map.getSource("name")` existence, not `isStyleLoaded()` — the latter fires before `load` and is unreliable as a readiness gate
- **WebGL context loss**: on context recovery, `style.load` fires again and all programmatically-added sources/layers are cleared; re-add sources checking `!map.getSource(...)` before `setData`; preserve data in refs for this purpose
- **sessionStorage**: all session state (origin, filter, map view) uses sessionStorage; new browser tab starts fresh

---

## Environment

```
practice-profiles/.env          MAPBOX_TOKEN, CENSUS_API_KEY
practice-profiles/frontend/.env VITE_MAPBOX_TOKEN
```

---

## File Structure

```
practice-profiles/
├── REQUIREMENTS.md
├── .env
├── .gitignore
├── backend/
│   ├── main.py
│   ├── auth.py
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── crud.py
│   ├── geocoding.py
│   ├── matrix.py
│   ├── importer.py
│   ├── tracts.py
│   ├── analytics.py
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js
        ├── supabaseClient.js
        └── components/
            ├── LoginPage.jsx
            ├── ResetPasswordForm.jsx
            ├── Map.jsx
            ├── Sidebar.jsx
            ├── FilterBar.jsx
            ├── PracticeCard.jsx
            ├── ImportModal.jsx
            ├── OriginBanner.jsx
            ├── PopulationPanel.jsx
            ├── SearchBar.jsx
            ├── TableView.jsx
            ├── TractDetailsPanel.jsx
            ├── AnalyticsView.jsx
            ├── AnalyticsControls.jsx
            ├── AnalyticsResults.jsx
            ├── AddPracticeModal.jsx
            ├── PatientOriginsModal.jsx
            └── TccnCompareView.jsx
```
