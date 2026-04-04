from sqlalchemy import Column, Integer, Text, Float, Boolean, ForeignKey, DateTime
from datetime import datetime
from database import Base


class Practice(Base):
    __tablename__ = "practices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    address = Column(Text, nullable=False)
    phone = Column(Text, nullable=True)
    num_mds = Column(Integer, nullable=False, default=0)
    num_apps = Column(Integer, nullable=False, default=0)
    num_locations = Column(Integer, nullable=False, default=1)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    affiliation = Column(Text, nullable=True)
    ownership   = Column(Text, nullable=True)
    is_de_novo  = Column(Boolean, nullable=False, default=False)
    geocoded = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class PatientOriginDataset(Base):
    __tablename__ = "patient_origin_datasets"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    practice_id = Column(Integer, ForeignKey("practices.id"), nullable=False)
    name        = Column(Text, nullable=False)
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class PatientOriginRow(Base):
    __tablename__ = "patient_origin_rows"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    dataset_id = Column(Integer, ForeignKey("patient_origin_datasets.id"), nullable=False)
    zip_code   = Column(Text, nullable=False)
    visit_count = Column(Integer, nullable=False)


class ZctaBoundary(Base):
    __tablename__ = "zcta_boundaries"

    zip_code      = Column(Text, primary_key=True)
    geometry_json = Column(Text, nullable=False)  # GeoJSON geometry object as JSON string


class TractDemographic(Base):
    __tablename__ = "tract_demographics"

    geoid         = Column(Text, primary_key=True)
    lat           = Column(Float)
    lng           = Column(Float)
    state_fips    = Column(Text)
    county_fips   = Column(Text)
    total_pop     = Column(Integer, default=0)
    under_18      = Column(Integer, default=0)
    under_5       = Column(Integer, default=0)
    income_median = Column(Integer)
    land_area_sqm = Column(Float)  # ALAND from Census TIGER (square meters)
    geometry      = Column(Text)   # simplified GeoJSON polygon (JSON string)


class TccnDirectoryEntry(Base):
    __tablename__ = "tccn_directory"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    provider_name  = Column(Text, nullable=False)
    specialty      = Column(Text, nullable=True)
    gender         = Column(Text, nullable=True)
    languages      = Column(Text, nullable=True)
    practice_name  = Column(Text, nullable=True)
    street         = Column(Text, nullable=True)
    city_state_zip = Column(Text, nullable=True)
    phone          = Column(Text, nullable=True)
    scraped_at     = Column(DateTime, nullable=False)


class TccnExclusion(Base):
    __tablename__ = "tccn_exclusions"

    practice_name = Column(Text, primary_key=True)
    reason        = Column(Text, nullable=True)
    created_at    = Column(DateTime, nullable=False)


class TractDistance(Base):
    __tablename__ = "tract_distances"

    geoid       = Column(Text, ForeignKey("tract_demographics.geoid"), primary_key=True)
    practice_id = Column(Integer, ForeignKey("practices.id"), primary_key=True)
    miles         = Column(Float)
    drive_minutes = Column(Float)


class CandidateLocation(Base):
    __tablename__ = "candidate_locations"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(Text, nullable=False)
    address     = Column(Text, nullable=False)
    lng         = Column(Float, nullable=True)
    lat         = Column(Float, nullable=True)
    practice_id = Column(Integer, ForeignKey("practices.id"), nullable=False)
    notes       = Column(Text, nullable=True)
    url         = Column(Text, nullable=True)
    created_at  = Column(DateTime, nullable=False, default=datetime.utcnow)


class UserLogin(Base):
    __tablename__ = "user_logins"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    user_id      = Column(Text, nullable=False)   # Supabase auth UUID
    email        = Column(Text, nullable=False)
    logged_in_at = Column(DateTime, nullable=False, default=datetime.utcnow)
