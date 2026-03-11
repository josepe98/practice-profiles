from __future__ import annotations

import json
import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Optional

import requests
from shapely.geometry import mapping, shape as shapely_shape
from sqlalchemy import text
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from database import SessionLocal
from models import TractDemographic, TractDistance, Practice as PracticeModel

TIGER_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/"
    "TIGERweb/tigerWMS_ACS2024/MapServer/8/query"
)
CENSUS_BASE = "https://api.census.gov/data/2024/acs/acs5"
MATRIX_URL = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving/{coords}"

MATRIX_LIMIT = 24
METERS_PER_MILE = 1609.344

# 10 miles covers all drives ≤ ~30 min in Atlanta.
# Tracts with no practice within 10 miles are true deserts and use haversine estimates.
MAX_HAVERSINE_MILES = 10.0

# Parallel Matrix API workers. 4 hides network latency without hammering rate limits.
# Shared rate limiter enforces ~8 requests/second globally across threads.
PRECOMPUTE_WORKERS = 4
API_MIN_INTERVAL = 0.13   # seconds between API calls globally → ~7.5 req/s

STATE_FIPS = "13"
MSA_COUNTIES = [
    "013", "015", "035", "045", "057", "063", "067", "077", "085",
    "089", "097", "113", "117", "121", "135", "143", "149", "151",
    "159", "171", "199", "211", "217", "223", "227", "231", "247",
    "255", "297",
]

TOTAL_VAR = "B01001_001E"
UNDER18_VARS = [f"B01001_{i:03d}E" for i in list(range(3, 7)) + list(range(27, 31))]
UNDER5_VARS = ["B01001_003E", "B01001_027E"]
INCOME_MED_VAR = "B19013_001E"
ACS_VARS = [TOTAL_VAR] + UNDER18_VARS + [INCOME_MED_VAR]

_status: Dict = {
    "running": False,
    "done": False,
    "step": "",
    "progress": 0,
    "total": 0,
    "last_run": None,
    "tract_count": 0,
    "practice_count": 0,
}

# Thread-safe rate limiter shared across all worker threads
_api_lock = threading.Lock()
_last_api_call_time: float = 0.0


def _api_sleep() -> None:
    """Block until at least API_MIN_INTERVAL seconds since the last API call."""
    global _last_api_call_time
    with _api_lock:
        wait = API_MIN_INTERVAL - (time.time() - _last_api_call_time)
        if wait > 0:
            time.sleep(wait)
        _last_api_call_time = time.time()


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _fetch_county_tracts(state: str, county: str) -> List[Dict]:
    params = {
        "where": f"STATE='{state}' AND COUNTY='{county}'",
        "outFields": "GEOID,STATE,COUNTY,TRACT,AREALAND",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
        "resultRecordCount": 2000,
    }
    resp = requests.get(TIGER_URL, params=params, timeout=30)
    resp.raise_for_status()
    features = resp.json().get("features", [])

    results = []
    for feat in features:
        props = feat.get("properties", {})
        geom_json = feat.get("geometry")
        if not geom_json:
            continue
        try:
            geom = shapely_shape(geom_json)
            # representative_point() is guaranteed inside the polygon — much less
            # likely to land on a highway median, river, or park than centroid().
            origin = geom.representative_point()
            simplified = geom.simplify(0.002)
            geometry_str = json.dumps(mapping(simplified))
        except Exception:
            continue
        geoid = str(props.get("GEOID", "")).zfill(11)
        aland_raw = props.get("AREALAND")
        land_area_sqm = float(aland_raw) if aland_raw is not None else None
        results.append({
            "geoid": geoid,
            "state_fips": state,
            "county_fips": county,
            "lat": origin.y,
            "lng": origin.x,
            "land_area_sqm": land_area_sqm,
            "geometry_str": geometry_str,
        })
    return results


def _fetch_county_acs(state: str, county: str, census_key: str) -> Dict:
    params: Dict = {
        "get": ",".join(ACS_VARS),
        "for": "tract:*",
        "in": f"state:{state}+county:{county}",
    }
    if census_key:
        params["key"] = census_key
    resp = requests.get(CENSUS_BASE, params=params, timeout=20)
    resp.raise_for_status()
    rows = resp.json()
    if len(rows) < 2:
        return {}
    headers = rows[0]
    results: Dict = {}
    for row in rows[1:]:
        d = dict(zip(headers, row))
        geoid = (
            d.get("state", "").zfill(2)
            + d.get("county", "").zfill(3)
            + d.get("tract", "").zfill(6)
        )

        def n(var: str) -> int:
            v = int(d.get(var) or "0")
            return v if v > 0 else 0

        total_pop = n(TOTAL_VAR)
        under_18 = sum(n(v) for v in UNDER18_VARS)
        under_5 = sum(n(v) for v in UNDER5_VARS)
        med_raw = int(d.get(INCOME_MED_VAR) or "0")
        results[geoid] = {
            "total_pop": total_pop,
            "under_18": under_18,
            "under_5": under_5,
            "income_median": med_raw if med_raw > 0 else None,
        }
    return results


def _compute_tract_distances(
    geoid: str,
    lat: float,
    lng: float,
    practice_list: List[Dict],
    mapbox_token: str,
) -> List[Dict]:
    """
    Compute drive distances from one tract representative point to all nearby practices.
    Returns a list of row dicts ready for bulk INSERT into tract_distances.
    Falls back to scaled haversine estimates if Mapbox returns all-null for the tract.
    """
    nearby_with_dist = sorted([
        (p, _haversine_miles(lat, lng, p["lat"], p["lng"]))
        for p in practice_list
        if _haversine_miles(lat, lng, p["lat"], p["lng"]) <= MAX_HAVERSINE_MILES
    ], key=lambda x: x[1])

    nearby = [p for p, _ in nearby_with_dist]
    if not nearby:
        return []

    rows: List[Dict] = []
    saved_any = False

    for batch_start in range(0, len(nearby), MATRIX_LIMIT):
        batch = nearby[batch_start: batch_start + MATRIX_LIMIT]
        coords_str = ";".join(
            [f"{lng},{lat}"] + [f"{p['lng']},{p['lat']}" for p in batch]
        )
        url = MATRIX_URL.format(coords=coords_str)
        params = {
            "access_token": mapbox_token,
            "sources": "0",
            "annotations": "distance,duration",
        }

        _api_sleep()

        matrix_data = None
        for attempt in range(3):
            try:
                resp = requests.get(url, params=params, timeout=30)
                if resp.status_code == 429:
                    time.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                matrix_data = resp.json()
                break
            except Exception:
                if attempt < 2:
                    time.sleep(1)

        if matrix_data is None:
            continue

        distances = matrix_data.get("distances", [[]])[0]
        durations = matrix_data.get("durations", [[]])[0]

        for j, practice in enumerate(batch):
            dist_m = (
                distances[j + 1]
                if distances and len(distances) > j + 1 and distances[j + 1] is not None
                else None
            )
            dur_s = (
                durations[j + 1]
                if durations and len(durations) > j + 1 and durations[j + 1] is not None
                else None
            )
            miles = round(dist_m / METERS_PER_MILE, 2) if dist_m is not None else None
            drive_minutes = round(dur_s / 60, 1) if dur_s is not None else None
            if miles is not None:
                rows.append({
                    "geoid": geoid,
                    "practice_id": practice["id"],
                    "miles": miles,
                    "drive_minutes": drive_minutes,
                })
                saved_any = True

    # Haversine fallback: centroid landed on a non-routable surface (highway, park, water).
    # Use road-factor 1.3× and 30 mph average → 2.6 min/mile. Guaranteed non-gray.
    if not saved_any:
        for practice, hav in nearby_with_dist[:10]:
            rows.append({
                "geoid": geoid,
                "practice_id": practice["id"],
                "miles": round(hav * 1.3, 2),
                "drive_minutes": round(hav * 2.6, 1),
            })

    return rows


def run_precompute(mapbox_token: str, census_key: str) -> None:
    _status["running"] = True
    _status["done"] = False
    _status["step"] = "Starting precompute..."
    _status["progress"] = 0
    _status["total"] = len(MSA_COUNTIES)

    db = SessionLocal()
    try:
        _status["step"] = "Clearing existing data..."
        db.execute(text("DELETE FROM tract_distances"))
        db.execute(text("DELETE FROM tract_demographics"))
        db.commit()

        # ── Phase 1: TIGER tract boundaries + Census ACS demographics ─────────
        all_tract_geoids: List[str] = []
        for i, county in enumerate(MSA_COUNTIES):
            _status["progress"] = i
            _status["step"] = f"County {county} ({i + 1}/{len(MSA_COUNTIES)}): tracts + demographics…"
            try:
                tiger_tracts = _fetch_county_tracts(STATE_FIPS, county)
                acs_data = _fetch_county_acs(STATE_FIPS, county, census_key)
                for tract in tiger_tracts:
                    demo = acs_data.get(tract["geoid"], {})
                    existing = db.query(TractDemographic).filter(
                        TractDemographic.geoid == tract["geoid"]
                    ).first()
                    if existing:
                        existing.lat = tract["lat"]
                        existing.lng = tract["lng"]
                        existing.state_fips = tract["state_fips"]
                        existing.county_fips = tract["county_fips"]
                        existing.land_area_sqm = tract.get("land_area_sqm")
                        existing.geometry = tract["geometry_str"]
                        existing.total_pop = demo.get("total_pop", 0)
                        existing.under_18 = demo.get("under_18", 0)
                        existing.under_5 = demo.get("under_5", 0)
                        existing.income_median = demo.get("income_median")
                    else:
                        db.add(TractDemographic(
                            geoid=tract["geoid"],
                            lat=tract["lat"],
                            lng=tract["lng"],
                            state_fips=tract["state_fips"],
                            county_fips=tract["county_fips"],
                            land_area_sqm=tract.get("land_area_sqm"),
                            geometry=tract["geometry_str"],
                            total_pop=demo.get("total_pop", 0),
                            under_18=demo.get("under_18", 0),
                            under_5=demo.get("under_5", 0),
                            income_median=demo.get("income_median"),
                        ))
                    all_tract_geoids.append(tract["geoid"])
                db.commit()
            except Exception as e:
                print(f"Warning: Failed county {county}: {e}")
                db.rollback()

        _status["progress"] = len(MSA_COUNTIES)
        _status["tract_count"] = len(all_tract_geoids)

        # ── Phase 2: drive distances via Mapbox Matrix ────────────────────────
        practices = db.query(PracticeModel).filter(
            PracticeModel.lat.isnot(None),
            PracticeModel.lng.isnot(None),
        ).all()
        practice_list = [{"id": p.id, "lat": p.lat, "lng": p.lng} for p in practices]
        _status["practice_count"] = len(practice_list)

        if not mapbox_token or not practice_list:
            _status["step"] = "No Mapbox token or geocoded practices — skipping distance computation."
            _status["done"] = True
            _status["running"] = False
            _status["last_run"] = datetime.now().isoformat()
            return

        valid_tracts = [
            t for t in db.query(TractDemographic).all()
            if t.lat is not None and t.lng is not None
        ]
        _status["total"] = len(valid_tracts)
        _status["progress"] = 0

        all_rows: List[Dict] = []
        completed = 0

        with ThreadPoolExecutor(max_workers=PRECOMPUTE_WORKERS) as executor:
            futures = {
                executor.submit(
                    _compute_tract_distances,
                    t.geoid, t.lat, t.lng, practice_list, mapbox_token
                ): t.geoid
                for t in valid_tracts
            }
            for future in as_completed(futures):
                completed += 1
                if completed % 25 == 0:
                    _status["progress"] = completed
                    _status["step"] = (
                        f"Distances: {completed}/{len(valid_tracts)} tracts"
                        f" · {len(all_rows):,} pairs found…"
                    )
                try:
                    rows = future.result()
                    all_rows.extend(rows)
                except Exception as e:
                    print(f"Warning: tract {futures[future]} failed: {e}")

        # Bulk INSERT — no per-row SELECTs needed since table was cleared above
        _status["step"] = f"Saving {len(all_rows):,} distance records…"
        if all_rows:
            db.execute(
                text(
                    "INSERT OR REPLACE INTO tract_distances "
                    "(geoid, practice_id, miles, drive_minutes) "
                    "VALUES (:geoid, :practice_id, :miles, :drive_minutes)"
                ),
                all_rows,
            )
            db.commit()

        _status["progress"] = len(valid_tracts)
        _status["done"] = True
        _status["running"] = False
        _status["last_run"] = datetime.now().isoformat()
        _status["step"] = "Complete"

    except Exception as e:
        _status["running"] = False
        _status["step"] = f"Error: {e}"
        print(f"Precompute failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


def _affil_where(affiliations: Optional[List[str]], param_prefix: str = "a") -> tuple:
    """Return (where_clause, params_dict) for an affiliation IN filter."""
    if affiliations:
        placeholders = ",".join([f":{param_prefix}{i}" for i in range(len(affiliations))])
        where = f"p.affiliation IN ({placeholders})"
        params = {f"{param_prefix}{i}": a for i, a in enumerate(affiliations)}
    else:
        where = "1=1"
        params = {}
    return where, params


def get_coverage_geojson(db: Session, affiliations: Optional[List[str]] = None) -> Dict:
    affil_where, affil_params = _affil_where(affiliations)
    sql = text(f"""
        WITH nearest AS (
            SELECT tdist.geoid,
                   MIN(tdist.miles) AS nearest_miles,
                   MIN(tdist.drive_minutes) AS nearest_minutes
            FROM tract_distances tdist
            JOIN practices p ON tdist.practice_id = p.id
            WHERE {affil_where} AND p.lat IS NOT NULL
            GROUP BY tdist.geoid
        )
        SELECT td.geoid, td.geometry, td.under_18, td.income_median,
               n.nearest_miles, n.nearest_minutes
        FROM tract_demographics td
        LEFT JOIN nearest n ON td.geoid = n.geoid
        WHERE td.geometry IS NOT NULL
    """)
    rows = db.execute(sql, affil_params).fetchall()
    features = []
    for row in rows:
        geoid, geometry_str, under_18, income_median, nearest_miles, nearest_minutes = row
        try:
            geometry = json.loads(geometry_str)
        except Exception:
            continue
        features.append({
            "type": "Feature",
            "id": geoid,
            "geometry": geometry,
            "properties": {
                "geoid": geoid,
                "under_18": under_18 or 0,
                "income_median": income_median,
                "nearest_miles": nearest_miles,
                "nearest_minutes": nearest_minutes,
            },
        })
    return {"type": "FeatureCollection", "features": features}


SQM_PER_SQMI = 2_589_988.11


def get_density_geojson(db: Session) -> Dict:
    """Return GeoJSON with under-18 population density (kids per sq mile) per tract."""
    rows = db.query(TractDemographic).filter(
        TractDemographic.geometry.isnot(None),
        TractDemographic.land_area_sqm.isnot(None),
        TractDemographic.land_area_sqm > 0,
    ).all()
    features = []
    for t in rows:
        try:
            geometry = json.loads(t.geometry)
        except Exception:
            continue
        sqmi = t.land_area_sqm / SQM_PER_SQMI
        kids_per_sqmi = round((t.under_18 or 0) / sqmi, 1) if sqmi > 0 else 0
        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "geoid": t.geoid,
                "under_18": t.under_18 or 0,
                "land_area_sqmi": round(sqmi, 2),
                "kids_per_sqmi": kids_per_sqmi,
            },
        })
    return {"type": "FeatureCollection", "features": features}


def get_gaps(
    db: Session,
    min_under_18: int,
    max_minutes: float,
    affiliations: Optional[List[str]] = None,
) -> List[Dict]:
    affil_where, affil_params = _affil_where(affiliations, param_prefix="a")
    sql = text(f"""
        WITH covered AS (
            SELECT tdist.geoid,
                   MIN(tdist.miles) AS miles,
                   MIN(tdist.drive_minutes) AS minutes
            FROM tract_distances tdist
            JOIN practices p ON tdist.practice_id = p.id
            WHERE {affil_where} AND p.lat IS NOT NULL
            GROUP BY tdist.geoid
        ),
        any_practice AS (
            SELECT tdist.geoid, MIN(tdist.miles) AS miles
            FROM tract_distances tdist
            JOIN practices p ON tdist.practice_id = p.id
            WHERE p.lat IS NOT NULL
            GROUP BY tdist.geoid
        )
        SELECT td.geoid, td.lat, td.lng, td.under_18, td.income_median,
               COALESCE(c.miles, 999.0) AS covered_miles,
               COALESCE(c.minutes, 999.0) AS covered_minutes,
               a.miles AS any_miles
        FROM tract_demographics td
        LEFT JOIN covered c ON td.geoid = c.geoid
        LEFT JOIN any_practice a ON td.geoid = a.geoid
        WHERE td.under_18 >= :min_under_18
          AND COALESCE(c.minutes, 999.0) > :max_minutes
        ORDER BY td.under_18 DESC
        LIMIT 200
    """)
    params = {**affil_params, "min_under_18": min_under_18, "max_minutes": max_minutes}
    rows = db.execute(sql, params).fetchall()
    return [
        {
            "geoid": row[0],
            "lat": row[1],
            "lng": row[2],
            "under_18": row[3] or 0,
            "income_median": row[4],
            "covered_miles": row[5],
            "covered_minutes": row[6],
            "any_miles": row[7],
        }
        for row in rows
    ]
