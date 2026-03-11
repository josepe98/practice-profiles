from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

import requests
from shapely.geometry import shape as shapely_shape

MIN_OVERLAP = 0.20  # fraction of tract area that must lie within the isochrone

TIGER_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/"
    "TIGERweb/tigerWMS_ACS2024/MapServer/8/query"
)
CENSUS_BASE = "https://api.census.gov/data/2024/acs/acs5"

# B01001 — Sex by Age variable codes
def _v(start: int, end: int) -> List[str]:
    return [f"B01001_{i:03d}E" for i in range(start, end + 1)]

TOTAL_VAR     = "B01001_001E"
UNDER5_VARS   = _v(3, 3)  + _v(27, 27)
AGE5_9_VARS   = _v(4, 4)  + _v(28, 28)
AGE10_14_VARS = _v(5, 5)  + _v(29, 29)
AGE15_17_VARS = _v(6, 6)  + _v(30, 30)

# B19001 — Household Income brackets, B19013 — Median Household Income
HH_TOTAL_VAR   = "B19001_001E"
HH_BRACKET_VARS = [f"B19001_{i:03d}E" for i in range(2, 18)]  # _002 to _017
INCOME_MED_VAR  = "B19013_001E"

# (lower, upper) dollar bounds for each of the 16 brackets
INCOME_BRACKET_BOUNDS = [
    (0,      10_000), (10_000, 15_000), (15_000, 20_000), (20_000, 25_000),
    (25_000, 30_000), (30_000, 35_000), (35_000, 40_000), (40_000, 45_000),
    (45_000, 50_000), (50_000, 60_000), (60_000, 75_000), (75_000, 100_000),
    (100_000, 125_000), (125_000, 150_000), (150_000, 200_000), (200_000, 250_000),
]

ALL_VARS = (
    [TOTAL_VAR] + UNDER5_VARS + AGE5_9_VARS + AGE10_14_VARS + AGE15_17_VARS
    + [HH_TOTAL_VAR] + HH_BRACKET_VARS + [INCOME_MED_VAR]
)


def _n(row_dict: Dict, var: str) -> int:
    """Parse a Census value, treating suppressed (-666666666) as 0."""
    raw = row_dict.get(var) or "0"
    v = int(raw)
    return v if v > 0 else 0


def _empty() -> Dict:
    return {
        "total": 0,
        "under_5": 0,
        "age_5_9": 0,
        "age_10_14": 0,
        "age_15_17": 0,
        "tract_count": 0,
        # income accumulators — removed before returning to caller
        "_income_weighted_sum": 0.0,
        "_income_hh_sum": 0.0,
        "_income_brackets": [0.0] * 16,
    }


def _compute_median_from_brackets(bracket_counts: List[float]) -> int:
    """Interpolate the combined median from aggregated bracket household counts."""
    total = sum(bracket_counts)
    if total == 0:
        return 0
    target = total / 2.0
    cumulative = 0.0
    for i, count in enumerate(bracket_counts):
        cumulative += count
        if cumulative >= target:
            lower, upper = INCOME_BRACKET_BOUNDS[i]
            prev = cumulative - count
            fraction = (target - prev) / count if count > 0 else 0.5
            return round(lower + fraction * (upper - lower))
    return INCOME_BRACKET_BOUNDS[-1][1]


def _extract_isochrone_polygon(isochrone_geojson: dict):
    """Extract a single Shapely geometry from a Mapbox isochrone FeatureCollection."""
    features = isochrone_geojson.get("features", [])
    if not features:
        raise ValueError("Isochrone GeoJSON has no features")
    # Mapbox returns one feature per contour; the first is the outermost polygon
    geom = features[0].get("geometry")
    if not geom:
        raise ValueError("Isochrone feature has no geometry")
    return shapely_shape(geom)


def _fetch_tiger_tracts(bbox_str: str) -> List[dict]:
    """Fetch census tract GeoJSON features from the TIGER WMS API within the bbox."""
    params = {
        "geometry": bbox_str,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "outFields": "GEOID,STATE,COUNTY,TRACT,AREALAND",
        "returnGeometry": "true",
        "f": "geojson",
    }
    resp = requests.get(TIGER_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("features", [])


def _fetch_county_population(
    state: str,
    county: str,
    tract_ratios: Dict[str, float],
    api_key: str,
) -> Dict:
    """
    Fetch ACS B01001 data for all tracts in (state, county), apply intersection
    ratios, and return weighted population totals.
    """
    result = _empty()
    params: Dict = {
        "get": ",".join(ALL_VARS),
        "for": "tract:*",
        "in": f"state:{state}+county:{county}",
    }
    if api_key:
        params["key"] = api_key

    resp = requests.get(CENSUS_BASE, params=params, timeout=20)
    resp.raise_for_status()

    try:
        rows = resp.json()
    except ValueError:
        raise ValueError(
            f"Census API returned non-JSON (HTTP {resp.status_code}). "
            "Check your CENSUS_API_KEY."
        )

    if len(rows) < 2:
        return result

    headers = rows[0]
    for row in rows[1:]:
        d = dict(zip(headers, row))
        # Build the 11-digit GEOID: 2-digit state + 3-digit county + 6-digit tract
        census_geoid = (
            d.get("state", "").zfill(2)
            + d.get("county", "").zfill(3)
            + d.get("tract", "").zfill(6)
        )
        ratio = tract_ratios.get(census_geoid, 0.0)
        if ratio == 0.0:
            continue

        result["total"]     += round(_n(d, TOTAL_VAR) * ratio)
        result["under_5"]   += round(sum(_n(d, v) for v in UNDER5_VARS) * ratio)
        result["age_5_9"]   += round(sum(_n(d, v) for v in AGE5_9_VARS) * ratio)
        result["age_10_14"] += round(sum(_n(d, v) for v in AGE10_14_VARS) * ratio)
        result["age_15_17"] += round(sum(_n(d, v) for v in AGE15_17_VARS) * ratio)

        # Income: weighted average accumulator
        hh = _n(d, HH_TOTAL_VAR)
        med_raw = int(d.get(INCOME_MED_VAR) or "0")
        if med_raw > 0 and hh > 0:
            result["_income_weighted_sum"] += med_raw * hh * ratio
            result["_income_hh_sum"]       += hh * ratio

        # Income: bracket counts for combined median
        for i, var in enumerate(HH_BRACKET_VARS):
            result["_income_brackets"][i] += _n(d, var) * ratio

    return result


def _fetch_county_tracts(
    state: str,
    county: str,
    tract_ratios: Dict[str, float],
    api_key: str,
) -> List[Dict]:
    """Return per-tract weighted population and income data for tracts in (state, county)."""
    results: List[Dict] = []
    params: Dict = {
        "get": ",".join(ALL_VARS),
        "for": "tract:*",
        "in": f"state:{state}+county:{county}",
    }
    if api_key:
        params["key"] = api_key

    resp = requests.get(CENSUS_BASE, params=params, timeout=20)
    resp.raise_for_status()

    try:
        rows = resp.json()
    except ValueError:
        raise ValueError(
            f"Census API returned non-JSON (HTTP {resp.status_code}). "
            "Check your CENSUS_API_KEY."
        )

    if len(rows) < 2:
        return results

    headers = rows[0]
    for row in rows[1:]:
        d = dict(zip(headers, row))
        census_geoid = (
            d.get("state", "").zfill(2)
            + d.get("county", "").zfill(3)
            + d.get("tract", "").zfill(6)
        )
        ratio = tract_ratios.get(census_geoid, 0.0)
        if ratio == 0.0:
            continue

        total     = _n(d, TOTAL_VAR)
        under_5   = sum(_n(d, v) for v in UNDER5_VARS)
        age_5_9   = sum(_n(d, v) for v in AGE5_9_VARS)
        age_10_14 = sum(_n(d, v) for v in AGE10_14_VARS)
        age_15_17 = sum(_n(d, v) for v in AGE15_17_VARS)
        med_raw   = int(d.get(INCOME_MED_VAR) or "0")

        results.append({
            "geoid":         census_geoid,
            "ratio":         ratio,
            "total":         round(total     * ratio),
            "under_5":       round(under_5   * ratio),
            "age_5_9":       round(age_5_9   * ratio),
            "age_10_14":     round(age_10_14 * ratio),
            "age_15_17":     round(age_15_17 * ratio),
            "income_median": med_raw if med_raw > 0 else None,
        })

    return results


def get_tract_details(isochrone_geojson: dict, min_overlap: float = MIN_OVERLAP) -> List[Dict]:
    """
    Return a list of per-tract dicts — GEOID, overlap ratio, weighted population
    by age band, and tract median household income — for all census tracts that
    intersect the isochrone above min_overlap.  Sorted by total descending.
    """
    iso_polygon = _extract_isochrone_polygon(isochrone_geojson)

    minx, miny, maxx, maxy = iso_polygon.bounds
    bbox_str = f"{minx},{miny},{maxx},{maxy}"

    tract_features = _fetch_tiger_tracts(bbox_str)
    if not tract_features:
        return []

    county_groups: Dict[Tuple[str, str], Dict[str, float]] = {}

    for feature in tract_features:
        props    = feature.get("properties", {})
        geom_json = feature.get("geometry")
        if not geom_json:
            continue
        try:
            tract_polygon = shapely_shape(geom_json)
        except Exception:
            continue

        if not tract_polygon.is_valid or tract_polygon.is_empty:
            continue
        try:
            intersection = iso_polygon.intersection(tract_polygon)
        except Exception:
            continue

        if intersection.is_empty:
            continue

        ratio = intersection.area / tract_polygon.area
        if ratio < min_overlap:
            continue

        geoid  = str(props.get("GEOID",  "")).zfill(11)
        state  = str(props.get("STATE",  "")).zfill(2)
        county = str(props.get("COUNTY", "")).zfill(3)

        key = (state, county)
        if key not in county_groups:
            county_groups[key] = {}
        county_groups[key][geoid] = ratio

    if not county_groups:
        return []

    api_key    = os.getenv("CENSUS_API_KEY", "")
    all_tracts: List[Dict] = []

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(_fetch_county_tracts, state, county, tract_ratios, api_key): (state, county)
            for (state, county), tract_ratios in county_groups.items()
        }
        for future in as_completed(futures):
            try:
                all_tracts.extend(future.result())
            except Exception as exc:
                sc = futures[future]
                print(f"Warning: Census fetch failed for {sc}: {exc}")

    all_tracts.sort(key=lambda t: t["total"], reverse=True)
    return all_tracts


def get_tract_geojson_for_isochrone(isochrone_geojson: dict, min_overlap: float = MIN_OVERLAP) -> dict:
    """
    Return a GeoJSON FeatureCollection of census tract boundaries that
    intersect the isochrone polygon — for visual overlay on the map.
    """
    iso_polygon = _extract_isochrone_polygon(isochrone_geojson)

    minx, miny, maxx, maxy = iso_polygon.bounds
    bbox_str = f"{minx},{miny},{maxx},{maxy}"

    tract_features = _fetch_tiger_tracts(bbox_str)
    if not tract_features:
        return {"type": "FeatureCollection", "features": []}

    intersecting = []
    for feature in tract_features:
        geom_json = feature.get("geometry")
        if not geom_json:
            continue
        try:
            tract_polygon = shapely_shape(geom_json)
        except Exception:
            continue
        if not tract_polygon.is_valid or tract_polygon.is_empty:
            continue
        try:
            intersection = iso_polygon.intersection(tract_polygon)
            if intersection.is_empty:
                continue
            if intersection.area / tract_polygon.area < min_overlap:
                continue
        except Exception:
            continue
        props = feature.get("properties", {})
        intersecting.append({
            "type": "Feature",
            "geometry": geom_json,
            "properties": {
                "GEOID": str(props.get("GEOID", "")).zfill(11),
                "TRACT": str(props.get("TRACT", "")),
            },
        })

    return {"type": "FeatureCollection", "features": intersecting}


def get_population_for_isochrone(isochrone_geojson: dict, min_overlap: float = MIN_OVERLAP) -> Dict:
    """
    Intersect the isochrone polygon with census tract boundaries, weight each
    tract's ACS population by the fraction of its area inside the isochrone,
    and return the summed population across all age bands.
    """
    iso_polygon = _extract_isochrone_polygon(isochrone_geojson)

    minx, miny, maxx, maxy = iso_polygon.bounds
    bbox_str = f"{minx},{miny},{maxx},{maxy}"

    tract_features = _fetch_tiger_tracts(bbox_str)
    if not tract_features:
        return _empty()

    # Build {(state, county): {geoid: ratio}} for intersecting tracts
    county_groups: Dict[Tuple[str, str], Dict[str, float]] = {}
    tract_count = 0

    for feature in tract_features:
        props = feature.get("properties", {})
        geom_json = feature.get("geometry")
        if not geom_json:
            continue
        try:
            tract_polygon = shapely_shape(geom_json)
        except Exception:
            continue

        if not tract_polygon.is_valid or tract_polygon.is_empty:
            continue

        try:
            intersection = iso_polygon.intersection(tract_polygon)
        except Exception:
            continue

        if intersection.is_empty:
            continue

        ratio = intersection.area / tract_polygon.area
        if ratio < min_overlap:
            continue

        # TIGER GEOID is already the 11-digit string; zero-pad just in case
        geoid = str(props.get("GEOID", "")).zfill(11)
        state = str(props.get("STATE", "")).zfill(2)
        county = str(props.get("COUNTY", "")).zfill(3)

        key = (state, county)
        if key not in county_groups:
            county_groups[key] = {}
        county_groups[key][geoid] = ratio
        tract_count += 1

    if not county_groups:
        return _empty()

    api_key = os.getenv("CENSUS_API_KEY", "")
    result = _empty()
    result["tract_count"] = tract_count

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(
                _fetch_county_population, state, county, tract_ratios, api_key
            ): (state, county)
            for (state, county), tract_ratios in county_groups.items()
        }
        for future in as_completed(futures):
            try:
                county_result = future.result()
            except Exception as exc:
                sc = futures[future]
                print(f"Warning: Census fetch failed for {sc}: {exc}")
                continue
            result["total"]     += county_result["total"]
            result["under_5"]   += county_result["under_5"]
            result["age_5_9"]   += county_result["age_5_9"]
            result["age_10_14"] += county_result["age_10_14"]
            result["age_15_17"] += county_result["age_15_17"]
            result["_income_weighted_sum"] += county_result["_income_weighted_sum"]
            result["_income_hh_sum"]       += county_result["_income_hh_sum"]
            for i in range(16):
                result["_income_brackets"][i] += county_result["_income_brackets"][i]

    # Derive final income figures from accumulators
    hh_sum = result.pop("_income_hh_sum")
    w_sum  = result.pop("_income_weighted_sum")
    brackets = result.pop("_income_brackets")

    result["income_weighted_avg"] = round(w_sum / hh_sum) if hh_sum > 0 else None
    result["income_median"]       = _compute_median_from_brackets(brackets) or None

    return result
