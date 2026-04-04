from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from models import Practice, CandidateLocation
from schemas import PracticeCreate, PracticeUpdate, CandidateLocationCreate


def get_practice(db: Session, practice_id: int):
    return db.query(Practice).filter(Practice.id == practice_id).first()


def get_practices(db: Session):
    return db.query(Practice).order_by(Practice.name).all()


def create_practice(db: Session, practice: PracticeCreate) -> Practice:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    db_practice = Practice(
        **practice.model_dump(),
        geocoded=1 if (practice.lat is not None and practice.lng is not None) else 0,
        created_at=now,
        updated_at=now,
    )
    db.add(db_practice)
    db.commit()
    db.refresh(db_practice)
    return db_practice


def update_practice(db: Session, practice_id: int, practice: PracticeUpdate) -> Practice | None:
    db_practice = get_practice(db, practice_id)
    if not db_practice:
        return None
    data = practice.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(db_practice, key, value)
    if "lat" in data or "lng" in data:
        if db_practice.lat is not None and db_practice.lng is not None:
            db_practice.geocoded = 1
    db_practice.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    db.commit()
    db.refresh(db_practice)
    return db_practice


def delete_practice(db: Session, practice_id: int) -> bool:
    db_practice = get_practice(db, practice_id)
    if not db_practice:
        return False
    db.delete(db_practice)
    db.commit()
    return True


def bulk_create_practices(db: Session, practices: list[dict]) -> int:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    objects = []
    for p in practices:
        objects.append(Practice(
            name=p["name"],
            address=p["address"],
            phone=p.get("phone"),
            affiliation=p.get("affiliation"),
            num_mds=int(p.get("num_mds") or 0),
            num_apps=int(p.get("num_apps") or 0),
            num_locations=int(p.get("num_locations") or 1),
            lat=p.get("lat"),
            lng=p.get("lng"),
            geocoded=1 if (p.get("lat") is not None and p.get("lng") is not None) else 0,
            created_at=now,
            updated_at=now,
        ))
    db.bulk_save_objects(objects)
    db.commit()
    return len(objects)


# ── Candidate locations ─────────────────────────────────────────────────────────

def get_candidates(db: Session):
    return db.query(CandidateLocation).order_by(CandidateLocation.created_at).all()


def get_candidate(db: Session, candidate_id: int):
    return db.query(CandidateLocation).filter(CandidateLocation.id == candidate_id).first()


def create_candidate(db: Session, candidate: CandidateLocationCreate) -> CandidateLocation:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    db_cand = CandidateLocation(
        **candidate.model_dump(),
        created_at=now,
    )
    db.add(db_cand)
    db.commit()
    db.refresh(db_cand)
    return db_cand


def delete_candidate(db: Session, candidate_id: int) -> bool:
    db_cand = get_candidate(db, candidate_id)
    if not db_cand:
        return False
    db.delete(db_cand)
    db.commit()
    return True
