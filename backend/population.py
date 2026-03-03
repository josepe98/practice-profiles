from __future__ import annotations

import os
from typing import List, Dict

import requests

CENSUS_BASE = "https://api.census.gov/data/2022/acs/acs5"

# B01001 — Sex by Age variable codes
# Male columns 003–025, Female columns 027–049

def _v(start: int, end: int) -> List[str]:
    return [f"B01001_{i:03d}E" for i in range(start, end + 1)]

TOTAL_VAR      = "B01001_001E"
UNDER5_VARS    = _v(3, 3)  + _v(27, 27)   # Under 5
AGE5_9_VARS    = _v(4, 4)  + _v(28, 28)   # 5–9
AGE10_14_VARS  = _v(5, 5)  + _v(29, 29)   # 10–14
AGE15_17_VARS  = _v(6, 6)  + _v(30, 30)   # 15–17
ALL_VARS       = [TOTAL_VAR] + UNDER5_VARS + AGE5_9_VARS + AGE10_14_VARS + AGE15_17_VARS

BATCH_SIZE = 100  # ZCTAs per Census API request


def _n(row_dict: Dict, var: str) -> int:
    """Parse a Census value, treating suppressed (-666666666) as 0."""
    raw = row_dict.get(var) or "0"
    v = int(raw)
    return v if v > 0 else 0


def get_population_by_zips(zip_codes: List[str]) -> Dict:
    if not zip_codes:
        return _empty()

    api_key = os.getenv("CENSUS_API_KEY", "")
    result = _empty()

    for i in range(0, len(zip_codes), BATCH_SIZE):
        batch = zip_codes[i : i + BATCH_SIZE]
        _fetch_batch(batch, api_key, result)

    return result


def _fetch_batch(zip_codes: List[str], api_key: str, result: Dict) -> None:
    params: Dict = {
        "get": ",".join(ALL_VARS),
        "for": "zip code tabulation area:" + ",".join(zip_codes),
    }
    if api_key:
        params["key"] = api_key

    resp = requests.get(CENSUS_BASE, params=params, timeout=20)
    resp.raise_for_status()

    try:
        rows = resp.json()
    except ValueError:
        raise ValueError(f"Census API returned non-JSON (HTTP {resp.status_code}). "
                         f"Check your CENSUS_API_KEY. Response: {resp.text[:200]}")
    if len(rows) < 2:
        return

    headers = rows[0]
    for row in rows[1:]:
        d = dict(zip(headers, row))
        result["total"]      += _n(d, TOTAL_VAR)
        result["under_5"]    += sum(_n(d, v) for v in UNDER5_VARS)
        result["age_5_9"]    += sum(_n(d, v) for v in AGE5_9_VARS)
        result["age_10_14"]  += sum(_n(d, v) for v in AGE10_14_VARS)
        result["age_15_17"]  += sum(_n(d, v) for v in AGE15_17_VARS)
        result["zip_count"]   += 1


def _empty() -> Dict:
    return {
        "total": 0,
        "under_5": 0,
        "age_5_9": 0,
        "age_10_14": 0,
        "age_15_17": 0,
        "zip_count": 0,
    }
