from __future__ import annotations

import csv
import io
import json
import time
from typing import List, Optional, Tuple

import openpyxl
import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models import PatientOriginDataset, PatientOriginRow, Practice, ZctaBoundary

router = APIRouter(prefix="/api/patient-origins", tags=["patient-origins"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

ZCTA_API = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/"
    "TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query"
)


# ── File parsing ────────────────────────────────────────────────────────────────

def _detect_columns(headers: List[str]) -> Tuple[int, int]:
    """Return (zip_col_index, count_col_index) by matching header keywords."""
    zip_idx = count_idx = None
    for i, h in enumerate(headers):
        hl = str(h).lower()
        if any(k in hl for k in ("zip", "postal", "zcta")):
            zip_idx = i
        if any(k in hl for k in ("visit", "count", "number", "total", "choa", "pc ")):
            count_idx = i
    # Fallback: assume first two columns
    if zip_idx is None:
        zip_idx = 0
    if count_idx is None or count_idx == zip_idx:
        # Pick the first column index that isn't the zip column
        count_idx = next((i for i in range(len(headers)) if i != zip_idx), zip_idx + 1)
    return zip_idx, count_idx


def _coerce_zip(val) -> Optional[str]:
    """Normalize a value to a 5-digit zip string, or None if invalid."""
    s = str(val).strip().split(".")[0]  # handle floats like 30058.0
    s = s.zfill(5)
    return s if s.isdigit() and len(s) == 5 else None


def parse_upload(content: bytes, filename: str) -> List[Tuple[str, int]]:
    """Parse xlsx or csv upload; return [(zip_code, visit_count), ...]."""
    rows: List[Tuple[str, int]] = []
    fname = filename.lower()

    if fname.endswith(".xlsx"):
        wb = openpyxl.load_workbook(io.BytesIO(content))
        ws = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
        if not all_rows:
            return rows
        headers = [str(h) for h in all_rows[0]]
        zip_idx, count_idx = _detect_columns(headers)
        for row in all_rows[1:]:
            try:
                z = _coerce_zip(row[zip_idx])
                c = int(row[count_idx])
                if z:
                    rows.append((z, c))
            except (TypeError, ValueError, IndexError):
                continue

    elif fname.endswith(".csv"):
        text = content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        headers = next(reader, [])
        zip_idx, count_idx = _detect_columns(headers)
        for row in reader:
            try:
                z = _coerce_zip(row[zip_idx])
                c = int(row[count_idx])
                if z:
                    rows.append((z, c))
            except (TypeError, ValueError, IndexError):
                continue
    else:
        raise ValueError("Only .xlsx and .csv files are supported")

    return rows


# ── ZCTA boundary fetching + caching ────────────────────────────────────────────

def _fetch_zcta_geometry(zip_code: str) -> Optional[dict]:
    """Fetch polygon geometry for a single ZCTA from Census TIGERweb."""
    try:
        resp = requests.get(
            ZCTA_API,
            params={
                "where": f"ZCTA5 = '{zip_code}'",
                "outFields": "ZCTA5",
                "f": "geojson",
                "outSR": "4326",
                "returnGeometry": "true",
            },
            timeout=20,
        )
        features = resp.json().get("features", [])
        if features:
            return features[0]["geometry"]
    except Exception as exc:
        print(f"[patient_origins] ZCTA boundary fetch failed for {zip_code}: {exc}")
    return None


def ensure_zcta_boundaries(zip_codes: List[str], db: Session) -> None:
    """Fetch and cache boundaries for any zip codes not already in the DB."""
    existing = {
        r.zip_code
        for r in db.query(ZctaBoundary).filter(ZctaBoundary.zip_code.in_(zip_codes)).all()
    }
    missing = [z for z in zip_codes if z not in existing]
    for zip_code in missing:
        geom = _fetch_zcta_geometry(zip_code)
        if geom:
            db.add(ZctaBoundary(zip_code=zip_code, geometry_json=json.dumps(geom)))
        time.sleep(0.1)  # gentle rate limiting
    if missing:
        db.commit()


# ── Routes ──────────────────────────────────────────────────────────────────────

@router.get("/datasets")
def list_datasets(db: Session = Depends(get_db)):
    datasets = (
        db.query(PatientOriginDataset)
        .order_by(PatientOriginDataset.uploaded_at.desc())
        .all()
    )
    practice_ids = {d.practice_id for d in datasets}
    practices = {
        p.id: p.name
        for p in db.query(Practice).filter(Practice.id.in_(practice_ids)).all()
    }
    row_counts = {}
    for d in datasets:
        row_counts[d.id] = db.query(PatientOriginRow).filter(
            PatientOriginRow.dataset_id == d.id
        ).count()

    return [
        {
            "id": d.id,
            "name": d.name,
            "practice_id": d.practice_id,
            "practice_name": practices.get(d.practice_id),
            "uploaded_at": d.uploaded_at.isoformat(),
            "zip_count": row_counts[d.id],
        }
        for d in datasets
    ]


@router.post("/upload")
async def upload_dataset(
    practice_id: int = Form(...),
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    practice = db.query(Practice).filter(Practice.id == practice_id).first()
    if not practice:
        raise HTTPException(status_code=404, detail="Practice not found")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (10 MB max)")
    try:
        parsed = parse_upload(content, file.filename or "upload")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not parsed:
        raise HTTPException(status_code=400, detail="No valid zip code rows found in file")

    dataset = PatientOriginDataset(practice_id=practice_id, name=name.strip())
    db.add(dataset)
    db.flush()  # get dataset.id

    for zip_code, visit_count in parsed:
        db.add(PatientOriginRow(
            dataset_id=dataset.id,
            zip_code=zip_code,
            visit_count=visit_count,
        ))
    db.commit()

    # Fetch missing ZCTA boundaries (sync is fine — typically only ~20 zips)
    ensure_zcta_boundaries([z for z, _ in parsed], db)

    return {"id": dataset.id, "name": dataset.name, "zip_count": len(parsed)}


@router.get("/{dataset_id}/geojson")
def get_geojson(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(PatientOriginDataset).filter(
        PatientOriginDataset.id == dataset_id
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    rows = db.query(PatientOriginRow).filter(
        PatientOriginRow.dataset_id == dataset_id
    ).all()

    if not rows:
        return {"type": "FeatureCollection", "features": []}

    max_count = max(r.visit_count for r in rows)
    zip_codes = [r.zip_code for r in rows]
    boundaries = {
        b.zip_code: b.geometry_json
        for b in db.query(ZctaBoundary).filter(ZctaBoundary.zip_code.in_(zip_codes)).all()
    }

    features = []
    for row in rows:
        geom_json = boundaries.get(row.zip_code)
        if not geom_json:
            continue
        features.append({
            "type": "Feature",
            "geometry": json.loads(geom_json),
            "properties": {
                "zip_code": row.zip_code,
                "visit_count": row.visit_count,
                "normalized": row.visit_count / max_count,
            },
        })

    return {"type": "FeatureCollection", "features": features}


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(PatientOriginDataset).filter(
        PatientOriginDataset.id == dataset_id
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    db.query(PatientOriginRow).filter(PatientOriginRow.dataset_id == dataset_id).delete()
    db.delete(dataset)
    db.commit()
