import time
import pandas as pd
from sqlalchemy.orm import Session
from geocoding import geocode_address
from crud import bulk_create_practices

GEOCODE_DELAY = 0.05  # seconds between geocoding calls for large CSVs

# Aliases: canonical name → list of accepted column names (lowercased)
COLUMN_ALIASES = {
    "name":          ["name", "group name", "practice name", "practice"],
    "address":       ["address"],  # may be assembled from parts — handled separately
    "phone":         ["phone", "phone number"],
    "affiliation":   ["affiliation", "group", "network", "system"],
    "num_mds":       ["num_mds", "physicians", "mds", "doctors", "num mds"],
    "num_apps":      ["num_apps", "apps", "num apps", "app count"],
    "num_locations": ["num_locations", "total practice locations", "locations", "num locations"],
    "lat":           ["lat", "latitude"],
    "lng":           ["lng", "lng", "longitude"],
}

# Address component columns that get joined into a single address string
ADDRESS_PART_ALIASES = ["address 1", "address1", "street", "street address"]
CITY_ALIASES   = ["city"]
STATE_ALIASES  = ["state"]
ZIP_ALIASES    = ["zip", "zip code", "postal code"]


def import_file(file_bytes: bytes, filename: str, db: Session) -> dict:
    """
    Parse CSV or Excel file and bulk-insert practices into the database.
    Handles:
      - Files with notes rows above the real header (auto-detected)
      - Flexible column name aliases
      - Address assembled from Address/City/State/Zip parts
    Returns {"imported": int, "skipped": int, "errors": [str]}
    """
    errors = []
    skipped = 0

    # ── Read file, auto-detecting header row ──────────────────────────────────
    try:
        df = _read_file(file_bytes, filename)
    except Exception as e:
        return {"imported": 0, "skipped": 0, "errors": [f"Failed to parse file: {e}"]}

    # Normalize column names to lowercase stripped strings
    df.columns = [str(c).strip().lower() for c in df.columns]
    cols = set(df.columns)

    # ── Map canonical field names to actual column names in this file ─────────
    col_map = {}  # canonical → actual column name
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in cols:
                col_map[canonical] = alias
                break

    # Detect address-part columns
    addr_part_col  = next((a for a in ADDRESS_PART_ALIASES if a in cols), None)
    city_col       = next((a for a in CITY_ALIASES        if a in cols), None)
    state_col      = next((a for a in STATE_ALIASES       if a in cols), None)
    zip_col        = next((a for a in ZIP_ALIASES         if a in cols), None)
    has_addr_parts = addr_part_col or (city_col and zip_col)

    # Require at least a name and some form of address
    if "name" not in col_map:
        return {"imported": 0, "skipped": 0, "errors": ["Could not find a 'name' or 'Group Name' column"]}
    if "address" not in col_map and not has_addr_parts:
        return {"imported": 0, "skipped": 0, "errors": ["Could not find address columns"]}

    # ── Process rows ──────────────────────────────────────────────────────────
    records = []
    for idx, row in df.iterrows():
        name = _clean(row.get(col_map["name"], ""))
        if not name:
            skipped += 1
            continue

        # Build address string
        if "address" in col_map:
            address = _clean(row.get(col_map["address"], ""))
        else:
            address = _build_address(row, addr_part_col, city_col, state_col, zip_col)

        if not address:
            skipped += 1
            continue

        record = {
            "name":          name,
            "address":       address,
            "phone":         _clean(row.get(col_map.get("phone",        "__missing__"), "")),
            "affiliation":   _clean(row.get(col_map.get("affiliation",  "__missing__"), "")) or None,
            "num_mds":       _int(row.get(col_map.get("num_mds",        "__missing__"), None), 0),
            "num_apps":      _int(row.get(col_map.get("num_apps",       "__missing__"), None), 0),
            "num_locations": _int(row.get(col_map.get("num_locations",  "__missing__"), None), 1),
            "lat":           None,
            "lng":           None,
        }

        # Use provided lat/lng if both present and valid
        lat_raw = row.get(col_map.get("lat", "__missing__"))
        lng_raw = row.get(col_map.get("lng", "__missing__"))
        try:
            if lat_raw and lng_raw and str(lat_raw) != "nan" and str(lng_raw) != "nan":
                record["lat"] = float(lat_raw)
                record["lng"] = float(lng_raw)
        except (ValueError, TypeError):
            pass

        # Geocode if no coordinates yet
        if record["lat"] is None or record["lng"] is None:
            coords = geocode_address(address)
            if coords:
                record["lat"], record["lng"] = coords
            else:
                errors.append(f"Row {idx + 2}: Could not geocode '{address}'")
            if len(records) > 0:
                time.sleep(GEOCODE_DELAY)

        records.append(record)

    imported = 0
    if records:
        try:
            imported = bulk_create_practices(db, records)
        except Exception as e:
            return {"imported": 0, "skipped": skipped, "errors": [f"Database insert failed: {e}"]}

    return {"imported": imported, "skipped": skipped, "errors": errors}


def _read_file(file_bytes, filename: str) -> pd.DataFrame:
    """Read CSV or Excel, skipping any leading notes rows to find the real header."""
    is_excel = filename.lower().endswith((".xlsx", ".xls"))

    if is_excel:
        # Read without header to scan for the real header row
        raw = pd.read_excel(file_bytes, header=None, dtype=str)
    else:
        raw = pd.read_csv(file_bytes, header=None, dtype=str)

    header_row = _find_header_row(raw)

    file_bytes.seek(0)
    if is_excel:
        return pd.read_excel(file_bytes, header=header_row, dtype=str)
    else:
        return pd.read_csv(file_bytes, header=header_row, dtype=str)


def _find_header_row(raw: pd.DataFrame) -> int:
    """
    Scan rows to find the first one that looks like a header —
    i.e. it has multiple non-null cells and at least one cell matches
    a known column alias or looks like a label (non-numeric string).
    Falls back to 0.
    """
    all_aliases = {alias for aliases in COLUMN_ALIASES.values() for alias in aliases}
    all_aliases.update(ADDRESS_PART_ALIASES + CITY_ALIASES + STATE_ALIASES + ZIP_ALIASES)

    for i, row in raw.iterrows():
        vals = [str(v).strip().lower() for v in row if str(v).strip() not in ("", "nan")]
        if len(vals) >= 3 and any(v in all_aliases for v in vals):
            return i
    return 0


def _build_address(row, addr_col, city_col, state_col, zip_col) -> str:
    parts = []
    if addr_col:
        v = _clean(row.get(addr_col, ""))
        if v:
            parts.append(v)
    if city_col:
        v = _clean(row.get(city_col, ""))
        if v:
            parts.append(v)
    if state_col:
        v = _clean(row.get(state_col, ""))
        if v:
            parts.append(v)
    if zip_col:
        v = _clean(row.get(zip_col, ""))
        if v:
            parts.append(v)
    return ", ".join(parts)


def _clean(val) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    return "" if s.lower() == "nan" else s


def _int(val, default: int) -> int:
    try:
        return int(float(str(val)))
    except (ValueError, TypeError):
        return default
