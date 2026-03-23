"""TCCN directory endpoints: scrape trigger + comparison against master table."""
from __future__ import annotations

import re
import subprocess
import sys
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Practice, TccnDirectoryEntry, TccnExclusion

_STOP  = re.compile(r"\b(llc|pc|inc|corp|pllc|pa|md|do|dba|of|the|and|at|an|a)\b")
_PUNCT = re.compile(r"[^\w\s]")
_WS    = re.compile(r"\s+")


def _norm(name: str) -> str:
    s = name.lower()
    s = _PUNCT.sub(" ", s)
    s = _STOP.sub(" ", s)
    s = _WS.sub(" ", s).strip()
    return s


router = APIRouter(prefix="/api/tccn", tags=["tccn"])


# ── Scrape trigger ─────────────────────────────────────────────────────────────

@router.post("/scrape")
def trigger_scrape():
    result = subprocess.run(
        [sys.executable, "scrape_tccn.py"],
        capture_output=True,
        text=True,
        cwd=__file__.rsplit("/", 1)[0],
    )
    return {"returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


# ── Directory listing ──────────────────────────────────────────────────────────

@router.get("/directory")
def list_directory(db: Session = Depends(get_db)):
    entries = db.query(TccnDirectoryEntry).order_by(
        TccnDirectoryEntry.practice_name, TccnDirectoryEntry.provider_name,
    ).all()
    return [
        {
            "id": e.id, "provider_name": e.provider_name, "specialty": e.specialty,
            "gender": e.gender, "languages": e.languages, "practice_name": e.practice_name,
            "street": e.street, "city_state_zip": e.city_state_zip, "phone": e.phone,
            "scraped_at": e.scraped_at.isoformat() if e.scraped_at else None,
        }
        for e in entries
    ]


# ── Exclusions ─────────────────────────────────────────────────────────────────

class ExclusionIn(BaseModel):
    practice_name: str
    reason: Optional[str] = None


@router.get("/exclusions")
def list_exclusions(db: Session = Depends(get_db)):
    return [
        {"practice_name": e.practice_name, "reason": e.reason,
         "created_at": e.created_at.isoformat()}
        for e in db.query(TccnExclusion).order_by(TccnExclusion.practice_name).all()
    ]


@router.post("/exclusions", status_code=201)
def add_exclusion(body: ExclusionIn, db: Session = Depends(get_db)):
    existing = db.query(TccnExclusion).filter(
        TccnExclusion.practice_name == body.practice_name
    ).first()
    if existing:
        return {"practice_name": existing.practice_name, "reason": existing.reason}
    exc = TccnExclusion(
        practice_name=body.practice_name,
        reason=body.reason,
        created_at=datetime.utcnow(),
    )
    db.add(exc)
    db.commit()
    return {"practice_name": exc.practice_name, "reason": exc.reason}


@router.delete("/exclusions/{practice_name}", status_code=204)
def remove_exclusion(practice_name: str, db: Session = Depends(get_db)):
    exc = db.query(TccnExclusion).filter(
        TccnExclusion.practice_name == practice_name
    ).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exclusion not found")
    db.delete(exc)
    db.commit()


# ── Comparison ─────────────────────────────────────────────────────────────────

@router.get("/compare")
def compare(db: Session = Depends(get_db)):
    entries    = db.query(TccnDirectoryEntry).all()
    exclusions = {e.practice_name for e in db.query(TccnExclusion).all()}

    scraped_at = None
    if entries:
        scraped_at = max(e.scraped_at for e in entries if e.scraped_at).isoformat()

    # Group directory entries by practice name
    practice_map: dict = {}
    for e in entries:
        name = (e.practice_name or "").strip() or "(no practice name)"
        if name not in practice_map:
            practice_map[name] = {"practice_name": name, "providers": set(), "locations": set()}
        practice_map[name]["providers"].add(e.provider_name)
        if e.street:
            practice_map[name]["locations"].add(
                f"{e.street}, {e.city_state_zip or ''}".strip(", ")
            )

    directory_practices = sorted(
        [
            {
                "practice_name":  name,
                "provider_count": len(d["providers"]),
                "location_count": len(d["locations"]),
                "provider_names": sorted(d["providers"]),
            }
            for name, d in practice_map.items()
        ],
        key=lambda x: x["practice_name"].lower(),
    )

    # Master table
    master = db.query(Practice).filter(Practice.affiliation == "TCCN").order_by(Practice.name).all()
    master_practices = [
        {
            "id": p.id, "name": p.name, "address": p.address,
            "num_mds": p.num_mds, "num_apps": p.num_apps,
            "total_providers": p.num_mds + p.num_apps,
        }
        for p in master
    ]

    # Fuzzy matching
    master_by_norm: dict = {}
    for p in master_practices:
        master_by_norm.setdefault(_norm(p["name"]), []).append(p)

    matched = []
    dir_only_active   = []
    dir_only_excluded = []
    used_master = set()

    for dp in directory_practices:
        if dp["practice_name"] == "(no practice name)":
            continue
        key = _norm(dp["practice_name"])
        candidates = master_by_norm.get(key, [])
        if not candidates:
            for mk, mv in master_by_norm.items():
                if key and mk and (key in mk or mk in key):
                    candidates = mv
                    break
        if candidates:
            mp = candidates[0]
            used_master.add(mp["id"])
            matched.append({
                "dir_name":         dp["practice_name"],
                "master_name":      mp["name"],
                "master_id":        mp["id"],
                "master_address":   mp["address"],
                "dir_providers":    dp["provider_count"],
                "dir_locations":    dp["location_count"],
                "master_providers": mp["total_providers"],
                "master_mds":       mp["num_mds"],
                "master_apps":      mp["num_apps"],
                "provider_names":   dp["provider_names"],
            })
        else:
            if dp["practice_name"] in exclusions:
                dir_only_excluded.append(dp)
            else:
                dir_only_active.append(dp)

    master_only = [p for p in master_practices if p["id"] not in used_master]

    return {
        "scraped_at":                scraped_at,
        "directory_total_providers": len({e.provider_name for e in entries}),
        "directory_total_practices": len(directory_practices),
        "master_total_practices":    len(master_practices),
        "matched_count":             len(matched),
        "dir_only_count":            len(dir_only_active),
        "dir_only_excluded_count":   len(dir_only_excluded),
        "master_only_count":         len(master_only),
        "matched":                   sorted(matched,           key=lambda x: x["dir_name"].lower()),
        "dir_only":                  sorted(dir_only_active,   key=lambda x: x["practice_name"].lower()),
        "dir_only_excluded":         sorted(dir_only_excluded, key=lambda x: x["practice_name"].lower()),
        "master_only":               sorted(master_only,       key=lambda x: x["name"].lower()),
    }
