from sqlalchemy import Column, Integer, Text, Float, ForeignKey
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
    geocoded = Column(Integer, nullable=False, default=0)
    created_at = Column(Text, nullable=False, default="datetime('now')")
    updated_at = Column(Text, nullable=False, default="datetime('now')")


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


class TractDistance(Base):
    __tablename__ = "tract_distances"

    geoid       = Column(Text, ForeignKey("tract_demographics.geoid"), primary_key=True)
    practice_id = Column(Integer, ForeignKey("practices.id"), primary_key=True)
    miles         = Column(Float)
    drive_minutes = Column(Float)
