from __future__ import annotations

import io
import csv
import os
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN", "")
CENSUS_API_KEY = os.getenv("CENSUS_API_KEY", "")

from database import engine, get_db, Base
import models  # noqa: F401 — ensures models are registered before create_all
from models import Practice as PracticeModel
from schemas import (
    Practice,
    PracticeCreate,
    PracticeUpdate,
    DistanceRequest,
    DistanceResult,
    ImportResult,
    IsochronePopulationRequest,
    TractBoundaryRequest,
    PopulationResult,
    TractDetail,
    AnalyticsStatus,
    GapResult,
    GapRequest,
)
import crud
import geocoding as geo
import matrix as mat
from importer import import_file
from tracts import get_population_for_isochrone, get_tract_geojson_for_isochrone, get_tract_details
from analytics import run_precompute, get_coverage_geojson, get_density_geojson, get_gaps, _status as analytics_status
from patient_origins import router as patient_origins_router
from tccn import router as tccn_router

# Create tables on startup
Base.metadata.create_all(bind=engine)

# Migrate: add columns that didn't exist in earlier schema versions
with engine.connect() as conn:
    cols = [r[1] for r in conn.execute(text("PRAGMA table_info(tract_demographics)"))]
    if "land_area_sqm" not in cols:
        conn.execute(text("ALTER TABLE tract_demographics ADD COLUMN land_area_sqm REAL"))
        conn.commit()

app = FastAPI(title="Practice Profiles API")

app.include_router(patient_origins_router)
app.include_router(tccn_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Practices ──────────────────────────────────────────────────────────────────

@app.get("/api/practices", response_model=List[Practice])
def list_practices(db: Session = Depends(get_db)):
    return crud.get_practices(db)


@app.get("/api/practices/{practice_id}", response_model=Practice)
def get_practice(practice_id: int, db: Session = Depends(get_db)):
    p = crud.get_practice(db, practice_id)
    if not p:
        raise HTTPException(status_code=404, detail="Practice not found")
    return p


@app.post("/api/practices", response_model=Practice, status_code=201)
def create_practice(practice: PracticeCreate, db: Session = Depends(get_db)):
    return crud.create_practice(db, practice)


@app.put("/api/practices/{practice_id}", response_model=Practice)
def update_practice(practice_id: int, practice: PracticeUpdate, db: Session = Depends(get_db)):
    p = crud.update_practice(db, practice_id, practice)
    if not p:
        raise HTTPException(status_code=404, detail="Practice not found")
    return p


@app.delete("/api/practices/{practice_id}", status_code=204)
def delete_practice(practice_id: int, db: Session = Depends(get_db)):
    if not crud.delete_practice(db, practice_id):
        raise HTTPException(status_code=404, detail="Practice not found")


# ── Import ─────────────────────────────────────────────────────────────────────

@app.post("/api/import/csv", response_model=ImportResult)
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    result = import_file(io.BytesIO(content), file.filename or "upload.csv", db)
    return result


@app.get("/api/import/template")
def download_template():
    columns = ["name", "address", "phone", "affiliation", "num_mds", "num_apps", "num_locations", "lat", "lng"]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(columns)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=practices_template.csv"},
    )


# ── Distances ──────────────────────────────────────────────────────────────────

@app.post("/api/distances", response_model=List[DistanceResult])
def get_distances(req: DistanceRequest, db: Session = Depends(get_db)):
    origin = crud.get_practice(db, req.origin_id)
    if not origin:
        raise HTTPException(status_code=404, detail="Origin practice not found")
    if origin.lat is None or origin.lng is None:
        raise HTTPException(status_code=422, detail="Origin practice has no coordinates")

    # Exclude origin from targets
    target_ids = [tid for tid in req.target_ids if tid != req.origin_id]
    if not target_ids:
        return []

    # Fetch targets from DB
    targets_db = db.query(PracticeModel).filter(
        PracticeModel.id.in_(target_ids),
        PracticeModel.lat.isnot(None),
        PracticeModel.lng.isnot(None),
    ).all()

    targets = [{"id": t.id, "lat": t.lat, "lng": t.lng} for t in targets_db]
    origin_dict = {"id": origin.id, "lat": origin.lat, "lng": origin.lng}

    results = mat.get_distances(origin_dict, targets)
    return results


# ── Population ─────────────────────────────────────────────────────────────────

@app.post("/api/tracts")
def tracts(req: TractBoundaryRequest):
    try:
        return get_tract_geojson_for_isochrone(req.isochrone, min_overlap=req.overlap_threshold)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TIGER API error: {e}")


@app.post("/api/population/tracts", response_model=List[TractDetail])
def population_tracts(req: IsochronePopulationRequest):
    try:
        return get_tract_details(req.isochrone, min_overlap=req.overlap_threshold)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Census/TIGER API error: {e}")


@app.post("/api/population", response_model=PopulationResult)
def population(req: IsochronePopulationRequest):
    try:
        result = get_population_for_isochrone(req.isochrone, min_overlap=req.overlap_threshold)
        return PopulationResult(**result)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Census/TIGER API error: {e}")


# ── Analytics ──────────────────────────────────────────────────────────────────

@app.post("/api/analytics/precompute")
def trigger_precompute(background_tasks: BackgroundTasks, force: bool = False):
    if analytics_status["running"]:
        raise HTTPException(status_code=409, detail="Precompute already running")
    background_tasks.add_task(run_precompute, CENSUS_API_KEY, force)
    return {"started": True}


@app.get("/api/analytics/status", response_model=AnalyticsStatus)
def analytics_status_endpoint():
    return analytics_status


@app.get("/api/analytics/coverage")
def coverage(affiliations: Optional[str] = None, db: Session = Depends(get_db)):
    affil_list = affiliations.split(",") if affiliations else None
    return get_coverage_geojson(db, affil_list)


@app.get("/api/analytics/density")
def density(db: Session = Depends(get_db)):
    return get_density_geojson(db)


@app.post("/api/analytics/gaps", response_model=List[GapResult])
def gaps(req: GapRequest, db: Session = Depends(get_db)):
    return get_gaps(db, req.min_under_18, req.max_minutes, req.affiliations)


# ── Re-geocode ─────────────────────────────────────────────────────────────────

@app.post("/api/geocode/{practice_id}", response_model=Practice)
def geocode_practice(practice_id: int, db: Session = Depends(get_db)):
    practice = crud.get_practice(db, practice_id)
    if not practice:
        raise HTTPException(status_code=404, detail="Practice not found")
    coords = geo.geocode_address(practice.address)
    if not coords:
        raise HTTPException(status_code=422, detail="Could not geocode address")
    lat, lng = coords
    updated = crud.update_practice(db, practice_id, PracticeUpdate(lat=lat, lng=lng))
    return updated
