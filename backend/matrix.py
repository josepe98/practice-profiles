import os
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN")
MATRIX_URL = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving/{coords}"
MATRIX_LIMIT = 24  # max destinations per request (25 total coords including origin)

METERS_PER_MILE = 1609.344


def get_distances(origin: dict, targets: list[dict]) -> list[dict]:
    """
    origin: {"id": ..., "lat": ..., "lng": ...}
    targets: [{"id": ..., "lat": ..., "lng": ...}, ...]
    Returns: [{"id": ..., "miles": float|None, "drive_minutes": float|None}, ...]
    """
    if not MAPBOX_TOKEN:
        raise RuntimeError("MAPBOX_TOKEN not set in environment")

    results = []

    for batch_start in range(0, len(targets), MATRIX_LIMIT):
        batch = targets[batch_start: batch_start + MATRIX_LIMIT]
        coords_list = [f"{origin['lng']},{origin['lat']}"] + [
            f"{t['lng']},{t['lat']}" for t in batch
        ]
        coords_str = ";".join(coords_list)
        url = MATRIX_URL.format(coords=coords_str)
        params = {
            "access_token": MAPBOX_TOKEN,
            "sources": "0",
            "annotations": "distance,duration",
        }
        try:
            resp = requests.get(url, params=params, timeout=30)
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
