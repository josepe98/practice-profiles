from sqlalchemy import Column, Integer, Text, Float
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
    geocoded = Column(Integer, nullable=False, default=0)
    created_at = Column(Text, nullable=False, default="datetime('now')")
    updated_at = Column(Text, nullable=False, default="datetime('now')")
