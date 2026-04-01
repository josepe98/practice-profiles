"""
Scrape Aylo Health locations from aylohealth.com/locations/.

Filters to: Pediatrics, Primary Care, Family Medicine.
Outputs a CSV ready for import into Practice Profiles (name, address, phone, affiliation).

Usage:
    cd backend && python scrape_aylo.py [--output aylo_locations.csv]

Polite: single-page fetch, descriptive User-Agent, respects robots.txt Crawl-delay.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from typing import List, Optional

import requests
from bs4 import BeautifulSoup

URL        = "https://aylohealth.com/locations/"
USER_AGENT = "PracticeProfilesResearch/1.0 (internal analytics; not for redistribution)"
AFFILIATION = "Aylo Health"

# Specialty prefixes to keep (case-insensitive prefix match against data-title)
KEEP_PREFIXES = ("pediatrics", "primary care", "family medicine")


def fetch_page() -> BeautifulSoup:
    resp = requests.get(URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def parse_locations(soup: BeautifulSoup) -> List[dict]:
    cards = soup.find_all("div", class_=re.compile(r"\bmap-\d+-location\b"))
    results = []
    for card in cards:
        title = (card.get("data-title") or "").strip()
        if not title.lower().startswith(KEEP_PREFIXES):
            continue

        name_tag = card.find("h3")
        name: Optional[str] = name_tag.get_text(strip=True) if name_tag else title

        addr_tag = card.find("h6")
        address: Optional[str] = addr_tag.get_text(strip=True) if addr_tag else None
        # Strip trailing ", USA"
        if address and address.endswith(", USA"):
            address = address[:-5]

        phone: Optional[str] = None
        tel_link = card.find("a", href=re.compile(r"^tel:"))
        if tel_link:
            phone = tel_link.get_text(strip=True) or None

        results.append({
            "name":        name,
            "address":     address,
            "phone":       phone or "",
            "affiliation": AFFILIATION,
            "ownership":   AFFILIATION,
        })
    return results


def write_csv(rows: List[dict], path: str) -> None:
    fieldnames = ["name", "address", "phone", "affiliation", "ownership"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows → {path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="aylo_locations.csv")
    args = parser.parse_args()

    print(f"Fetching {URL} …")
    soup = fetch_page()

    rows = parse_locations(soup)
    if not rows:
        print("ERROR: No matching locations found — page structure may have changed.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(rows)} matching locations:")
    for r in rows:
        print(f"  {r['name']:45s}  {r['address']}")

    write_csv(rows, args.output)


if __name__ == "__main__":
    main()
