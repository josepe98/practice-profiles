from __future__ import annotations

import re
from typing import List

import requests
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# Distribution IDs for the "Indicators" datastore on pfs.data.cms.gov.
# These are internal DKAN resource IDs — stable for each year's release.
DIST_IDS = {
    2025: "eaaa3c55-770e-5e77-8f1d-615e46c1a789",
    2024: "e47a0f0a-3b71-55e4-8dcd-d4b7088327cb",
}

_PFS_SQL = "https://pfs.data.cms.gov/api/1/datastore/sql"
_CODE_RE = re.compile(r"^[A-Z0-9]{1,7}$")

# In-memory cache: (year, code) -> list[dict]. Data changes once per year.
_cache: dict = {}


def _fetch_rows(year: int, code: str) -> List[dict]:
    key = (year, code)
    if key in _cache:
        return _cache[key]
    dist_id = DIST_IDS[year]
    query = f'[SELECT * FROM {dist_id}][WHERE hcpc = "{code}"][LIMIT 100]'
    try:
        resp = requests.get(_PFS_SQL, params={"query": query}, timeout=10)
        resp.raise_for_status()
        rows = resp.json()
        if not isinstance(rows, list):
            rows = []
    except Exception:
        rows = []
    _cache[key] = rows
    return rows


@router.get("/api/rvu")
def get_rvu(codes: str = Query(...), year: int = Query(2025)):
    if year not in DIST_IDS:
        raise HTTPException(400, f"year must be one of {sorted(DIST_IDS.keys())}")

    raw = codes.replace("\n", ",").replace(" ", ",")
    code_list = [c.strip().upper() for c in raw.split(",") if c.strip()]
    code_list = list(dict.fromkeys(code_list))  # deduplicate, preserve order

    if not code_list:
        raise HTTPException(400, "No codes provided")
    if len(code_list) > 100:
        raise HTTPException(400, "Maximum 100 codes per request")

    invalid = [c for c in code_list if not _CODE_RE.match(c)]
    if invalid:
        raise HTTPException(400, f"Invalid code(s): {', '.join(invalid)}")

    return [{"code": code, "rows": _fetch_rows(year, code)} for code in code_list]
