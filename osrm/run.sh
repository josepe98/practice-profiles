#!/bin/bash
# Start the OSRM routing server on port 5001.
# Run osrm/setup.sh first to prepare the data files.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
PORT="${OSRM_PORT:-5001}"

if [ ! -f "$DATA_DIR/georgia-latest.osrm" ]; then
  echo "Error: OSRM data not found. Run ./osrm/setup.sh first."
  exit 1
fi

echo "Starting OSRM on port $PORT..."
docker run --rm -d \
  --name osrm-backend \
  --memory=2g \
  -p "$PORT:5000" \
  -v "$DATA_DIR:/data" \
  osrm/osrm-backend \
  osrm-routed --algorithm mld --max-table-size 10000 /data/georgia-latest.osrm

echo "OSRM running at http://localhost:$PORT"
echo "Test: curl 'http://localhost:$PORT/table/v1/driving/-84.388,33.749;-84.551,33.770?annotations=duration,distance'"
echo ""
echo "Stop with: docker stop osrm-backend"
