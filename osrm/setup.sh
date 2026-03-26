#!/bin/bash
# Download Georgia OSM extract and prepare OSRM data files.
# Run this once (or whenever you want fresh map data).
# Requires Docker.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
REGION_URL="https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf"
REGION_FILE="georgia-latest.osm.pbf"

mkdir -p "$DATA_DIR"

# Download if not already present
if [ ! -f "$DATA_DIR/$REGION_FILE" ]; then
  echo "Downloading Georgia OSM extract..."
  curl -L -o "$DATA_DIR/$REGION_FILE" "$REGION_URL"
else
  echo "OSM extract already downloaded."
fi

echo "Extracting routing graph (this may take a few minutes)..."
docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/$REGION_FILE

echo "Partitioning..."
docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend \
  osrm-partition /data/georgia-latest.osrm

echo "Customizing..."
docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend \
  osrm-customize /data/georgia-latest.osrm

echo ""
echo "Done! Start OSRM with:"
echo "  ./osrm/run.sh"
