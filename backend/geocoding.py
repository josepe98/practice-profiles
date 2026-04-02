from __future__ import annotations

import os
from typing import Optional, Tuple
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN")
GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"


def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    """Return (lat, lng) for the given address, or None on failure."""
    if not MAPBOX_TOKEN:
        raise RuntimeError("MAPBOX_TOKEN not set in environment")

    url = GEOCODING_URL.format(query=requests.utils.quote(address))
    params = {
        "access_token": MAPBOX_TOKEN,
        "limit": 1,
        "types": "address,place",
        "country": "US",
    }
    try:
        resp = requests.get(url, params=params, timeout=10, headers={
                "Referer": "https://practice-profiles.vercel.app",
                "Origin": "https://practice-profiles.vercel.app",
            })
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if not features:
            return None
        lng, lat = features[0]["geometry"]["coordinates"]
        return lat, lng
    except Exception:
        return None
