"""
Scrape the TCCN provider directory into the tccn_directory DB table.

Usage:
    cd backend && python scrape_tccn.py

Clears and repopulates the table on each run (fully repeatable).
Polite: 2-second delay between pages, descriptive User-Agent.
"""
from __future__ import annotations

import re
import sys
import time
from datetime import datetime
from typing import List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from database import engine, SessionLocal, Base
from models import TccnDirectoryEntry

BASE_URL   = "https://www.tccn-choa.org/provider-directory"
USER_AGENT = "PracticeProfilesResearch/1.0 (internal analytics tool; not for redistribution)"
PAGE_SIZE  = 10
DELAY_SEC  = 2.0


def _get_page(session: requests.Session, offset: int) -> BeautifulSoup:
    resp = session.get(
        BASE_URL,
        params={"q": "", "s": offset},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def _parse_total(soup: BeautifulSoup) -> int:
    """Extract total result count from e.g. 'Showing 1-10 of 652 Results'."""
    text = soup.get_text(" ", strip=True)
    m = re.search(r"Showing\s+\d+-\d+\s+of\s+(\d+)\s+Results", text, re.IGNORECASE)
    return int(m.group(1)) if m else 0


def _parse_info(info_div) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (specialty, gender, languages) from the .info-container div."""
    specialty = gender = languages = None
    if not info_div:
        return specialty, gender, languages
    container = info_div.find(class_="info-container")
    if not container:
        return specialty, gender, languages
    titles = container.find_all("p", class_="title")
    texts  = container.find_all("p", class_="text")
    for t, v in zip(titles, texts):
        label = t.get_text(strip=True).lower().rstrip(":")
        val   = v.get_text(strip=True)
        if "specialty" in label:
            specialty = val
        elif "gender" in label:
            gender = val
        elif "language" in label:
            languages = val
    return specialty, gender, languages


def _parse_locations(locations_div) -> List[dict]:
    """Return list of {practice_name, street, city_state_zip, phone} dicts."""
    if not locations_div:
        return []
    results = []
    # Grab ALL <ul> blocks, including those inside .collapse
    for ul in locations_div.find_all("ul"):
        name_li  = ul.find("li", class_="name")
        street_li = ul.find("li", class_="street")
        csz_li   = ul.find("li", class_="citStateZip")
        phone_li = ul.find("li", class_="phone")
        if not name_li:
            continue
        phone_text = None
        if phone_li:
            a = phone_li.find("a")
            phone_text = (a.get_text(strip=True) if a else phone_li.get_text(strip=True)) or None
        results.append({
            "practice_name":  name_li.get_text(strip=True) or None,
            "street":         street_li.get_text(strip=True) if street_li else None,
            "city_state_zip": csz_li.get_text(strip=True)   if csz_li   else None,
            "phone":          phone_text,
        })
    return results


def scrape_all() -> List[dict]:
    """Fetch all pages and return a flat list of provider-location dicts."""
    http = requests.Session()
    http.headers.update({"User-Agent": USER_AGENT})

    print("Fetching page 1 to determine total count…")
    first = _get_page(http, 0)
    total = _parse_total(first)
    if total == 0:
        print("WARNING: Could not determine total count — aborting.")
        sys.exit(1)

    pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    print(f"Found {total} providers across {pages} pages.")

    all_rows: List[dict] = []
    soups = [first] + [None] * (pages - 1)

    for page_idx in range(pages):
        if page_idx > 0:
            offset = page_idx * PAGE_SIZE
            print(f"  Fetching page {page_idx + 1}/{pages} (s={offset})…")
            time.sleep(DELAY_SEC)
            soups[page_idx] = _get_page(http, offset)

        soup = soups[page_idx]
        cards = soup.find_all("div", class_="returnContainer")
        for card in cards:
            name_p = card.find("p", class_="name")
            provider_name = name_p.get_text(strip=True) if name_p else "Unknown"

            info_div      = card.find("div", class_="info")
            locations_div = card.find("div", class_="locations")

            specialty, gender, languages = _parse_info(info_div)
            locations = _parse_locations(locations_div)

            if not locations:
                # Provider with no location data — still record them
                all_rows.append({
                    "provider_name":  provider_name,
                    "specialty":      specialty,
                    "gender":         gender,
                    "languages":      languages,
                    "practice_name":  None,
                    "street":         None,
                    "city_state_zip": None,
                    "phone":          None,
                })
            else:
                for loc in locations:
                    all_rows.append({
                        "provider_name": provider_name,
                        "specialty":     specialty,
                        "gender":        gender,
                        "languages":     languages,
                        **loc,
                    })

    return all_rows


def save_to_db(rows: List[dict]) -> None:
    """Clear the tccn_directory table and insert fresh rows."""
    db: Session = SessionLocal()
    try:
        deleted = db.query(TccnDirectoryEntry).delete()
        print(f"Cleared {deleted} existing rows.")
        now = datetime.utcnow()
        objects = [TccnDirectoryEntry(scraped_at=now, **r) for r in rows]
        db.bulk_save_objects(objects)
        db.commit()
        print(f"Inserted {len(objects)} rows.")
    finally:
        db.close()


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    rows = scrape_all()
    print(f"\nTotal provider-location rows scraped: {len(rows)}")
    save_to_db(rows)
    print("Done.")
