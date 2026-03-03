from __future__ import annotations

from pydantic import BaseModel
from typing import List, Optional


class PracticeBase(BaseModel):
    name: str
    address: str
    phone: Optional[str] = None
    num_mds: int = 0
    num_apps: int = 0
    num_locations: int = 1
    lat: Optional[float] = None
    lng: Optional[float] = None


class PracticeCreate(PracticeBase):
    pass


class PracticeUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    num_mds: Optional[int] = None
    num_apps: Optional[int] = None
    num_locations: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class Practice(PracticeBase):
    id: int
    geocoded: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class DistanceRequest(BaseModel):
    origin_id: int
    target_ids: List[int]


class DistanceResult(BaseModel):
    id: int
    miles: Optional[float]
    drive_minutes: Optional[float]


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: List[str]


class IsochronePopulationRequest(BaseModel):
    isochrone: dict  # GeoJSON FeatureCollection from Mapbox Isochrone API


class PopulationResult(BaseModel):
    total: int
    under_5: int
    age_5_9: int
    age_10_14: int
    age_15_17: int
    tract_count: int
