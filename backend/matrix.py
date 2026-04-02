from __future__ import annotations

import os
from typing import List, Dict, Optional
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN", "")
MATRIX_URL = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving/{coords}"
MATRIX_LIMIT = 24  # Mapbox Matrix API max is 25 coordinates (1 origin + 24 destinations)

METERS_PER_MILE = 1609.344


def get_distances(origin: dict, targets: List[dict]) -> List[dict]:
    """
    origin: {"id": ..., "lat": ..., "lng": ...}
    targets: [{"id": ..., "lat": ..., "lng": ...}, ...]
    Returns: [{"id": ..., "miles": float|None, "drive_minutes": float|None}, ...]
    """
    results = []

    for batch_start in range(0, len(targets), MATRIX_LIMIT):
        batch = targets[batch_start: batch_start + MATRIX_LIMIT]
        coords_list = [f"{origin['lng']},{origin['lat']}"] + [
            f"{t['lng']},{t['lat']}" for t in batch
        ]
        coords_str = ";".join(coords_list)
        url = MATRIX_URL.format(coords=coords_str)
        params = {
            "sources": "0",
            "annotations": "distance,duration",
            "access_token": MAPBOX_TOKEN,
        }
        try:
            resp = requests.get(url, params=params, timeout=30, headers={
                "Referer": "https://practice-profiles.vercel.app",
                "Origin": "https://practice-profiles.vercel.app",
            })
            resp.raise_for_status()
            data = resp.json()
            distances = data.get("distances", [[]])[0]
            durations = data.get("durations", [[]])[0]

            for i, target in enumerate(batch):
                dist_m = distances[i + 1] if distances and distances[i + 1] is not None else None
                dur_s = durations[i + 1] if durations and durations[i + 1] is not None else None
                results.append({
                    "id": target["id"],
                    "miles": round(dist_m / METERS_PER_MILE, 2) if dist_m is not None else None,
                    "drive_minutes": round(dur_s / 60, 1) if dur_s is not None else None,
                })
        except Exception as e:
            # On error, mark all targets in this batch as unreachable
            for target in batch:
                results.append({"id": target["id"], "miles": None, "drive_minutes": None})

    return results
