#!/bin/bash
# Start both backend and frontend servers

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Practice Profiles App..."

# Start backend
cd "$ROOT_DIR/backend"
source venv/bin/activate
uvicorn main:app --reload --port 8001 &
BACKEND_PID=$!
echo "Backend started (PID $BACKEND_PID)"

# Start frontend
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
echo "Frontend started (PID $FRONTEND_PID)"

echo ""
echo "App running at http://localhost:5174"
echo "API docs at  http://localhost:8001/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait and clean up on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Servers stopped.'" EXIT
wait
