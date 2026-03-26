import io
import csv
import os
import traceback
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN", "")
CENSUS_API_KEY = os.getenv("CENSUS_API_KEY", "")

from database import engine, get_db, Base
import models  # noqa: F401 — ensures models are registered before create_all
from models import Practice as PracticeModel, UserLogin
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
)
import crud
import geocoding as geo
import matrix as mat
from importer import import_file
from tracts import get_population_for_isochrone, get_tract_geojson_for_isochrone, get_tract_details
from analytics import run_precompute, run_demographics_only, get_coverage_geojson, get_density_geojson, _status as analytics_status, _demo_status as demo_status
from patient_origins import router as patient_origins_router
from tccn import router as tccn_router
from auth import require_auth

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

# ── Rate limiter ────────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

# ── App ─────────────────────────────────────────────────────────────────────────

# Create tables on startup (safe for both SQLite and PostgreSQL)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Practice Profiles API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(patient_origins_router)
app.include_router(tccn_router)

# ── Middleware (last added = outermost = runs first) ────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "connect-src 'self' https://*.supabase.co https://api.mapbox.com "
            "https://events.mapbox.com https://api.census.gov https://tigerweb.geo.census.gov; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://api.mapbox.com; "
            "img-src 'self' data: blob: https://*.mapbox.com; "
            "worker-src blob:;"
        )
        return response


class AuthMiddleware(BaseHTTPMiddleware):
    SKIP_PATHS = {"/health", "/api/auth/login-event"}

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path in self.SKIP_PATHS:
            return await call_next(request)
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        from auth import require_auth as _validate
        try:
            payload = _validate(authorization=auth_header)
            request.state.user = payload
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return await call_next(request)


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuthMiddleware)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5174")
_allowed_origins = [o.strip() for o in _raw_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Generic error handler (no stack traces to client) ──────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── Health (public) ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── Auth ────────────────────────────────────────────────────────────────────────

@app.post("/api/auth/login-event", status_code=204)
def login_event(request: Request, db: Session = Depends(get_db)):
    """Called by the frontend after a successful Supabase login to record the event."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return
    from auth import require_auth as _validate
    try:
        user = _validate(authorization=auth_header)
        db.add(UserLogin(
            user_id=user.get("sub", ""),
            email=user.get("email", ""),
            logged_in_at=datetime.utcnow(),
        ))
        db.commit()
    except Exception:
        pass  # login logging is best-effort


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
@limiter.limit("10/minute")
async def import_csv(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (10 MB max)")
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
@limiter.limit("30/minute")
def get_distances(request: Request, req: DistanceRequest, db: Session = Depends(get_db)):
    origin = crud.get_practice(db, req.origin_id)
    if not origin:
        raise HTTPException(status_code=404, detail="Origin practice not found")
    if origin.lat is None or origin.lng is None:
        raise HTTPException(status_code=422, detail="Origin practice has no coordinates")

    target_ids = [tid for tid in req.target_ids if tid != req.origin_id]
    if not target_ids:
        return []

    targets_db = db.query(PracticeModel).filter(
        PracticeModel.id.in_(target_ids),
        PracticeModel.lat.isnot(None),
        PracticeModel.lng.isnot(None),
    ).all()

    targets = [{"id": t.id, "lat": t.lat, "lng": t.lng} for t in targets_db]
    origin_dict = {"id": origin.id, "lat": origin.lat, "lng": origin.lng}
    return mat.get_distances(origin_dict, targets)


# ── Population ─────────────────────────────────────────────────────────────────

@app.post("/api/tracts")
def tracts(req: TractBoundaryRequest):
    try:
        return get_tract_geojson_for_isochrone(req.isochrone, min_overlap=req.overlap_threshold)
    except Exception:
        raise HTTPException(status_code=502, detail="Tract boundary service unavailable")


@app.post("/api/population/tracts", response_model=List[TractDetail])
def population_tracts(req: IsochronePopulationRequest):
    try:
        return get_tract_details(req.isochrone, min_overlap=req.overlap_threshold)
    except Exception:
        raise HTTPException(status_code=502, detail="Census service unavailable")


@app.post("/api/population", response_model=PopulationResult)
def population(req: IsochronePopulationRequest):
    try:
        result = get_population_for_isochrone(req.isochrone, min_overlap=req.overlap_threshold)
        return PopulationResult(**result)
    except Exception:
        raise HTTPException(status_code=502, detail="Census service unavailable")


# ── Analytics ──────────────────────────────────────────────────────────────────

@app.post("/api/analytics/precompute")
@limiter.limit("3/hour")
def trigger_precompute(request: Request, background_tasks: BackgroundTasks, force: bool = False):
    if analytics_status["running"]:
        raise HTTPException(status_code=409, detail="Precompute already running")
    background_tasks.add_task(run_precompute, CENSUS_API_KEY, force)
    return {"started": True}


@app.post("/api/analytics/precompute-demographics")
@limiter.limit("5/hour")
def trigger_demographics(request: Request, background_tasks: BackgroundTasks):
    if demo_status["running"]:
        raise HTTPException(status_code=409, detail="Demographics refresh already running")
    background_tasks.add_task(run_demographics_only, CENSUS_API_KEY)
    return {"started": True}


@app.get("/api/analytics/demographics-status")
def demographics_status_endpoint():
    return demo_status


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


# ── Geocode ─────────────────────────────────────────────────────────────────────

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
