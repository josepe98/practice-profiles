from __future__ import annotations

import io
import csv
from typing import List
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

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
    PopulationResult,
)
import crud
import geocoding as geo
import matrix as mat
from importer import import_file
from tracts import get_population_for_isochrone

# Create tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Practice Profiles API")

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
    columns = ["name", "address", "phone", "num_mds", "num_apps", "num_locations", "lat", "lng"]
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

@app.post("/api/population", response_model=PopulationResult)
def population(req: IsochronePopulationRequest):
    try:
        result = get_population_for_isochrone(req.isochrone)
        return PopulationResult(**result)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Census/TIGER API error: {e}")


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
