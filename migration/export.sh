#!/usr/bin/env bash
# Dump everything from Supabase that we'd lose if the project is deleted.
# Requires DATABASE_URL_DIRECT in the environment (do NOT hardcode it here).
#
# DATABASE_URL_DIRECT must be the *direct* connection or *session pooler*,
# NOT the transaction pooler (port 6543). pg_dump cannot run through the
# transaction pooler — it requires session-level features.
# Find the right URL in Supabase Dashboard → Project Settings → Database
# → Connection string → "Direct connection" or "Session pooler".

set -euo pipefail

if [ -z "${DATABASE_URL_DIRECT:-}" ]; then
  echo "error: DATABASE_URL_DIRECT is not set" >&2
  echo "  export DATABASE_URL_DIRECT='postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres'" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "error: pg_dump not found on PATH (try: brew install postgresql@16)" >&2
  exit 1
fi

OUT="$(cd "$(dirname "$0")" && pwd)/dumps"
mkdir -p "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

echo "→ dumping public schema (DDL)…"
pg_dump "$DATABASE_URL_DIRECT" \
  --schema=public \
  --schema-only \
  --no-owner --no-privileges \
  --file "$OUT/public-schema-$STAMP.sql"

echo "→ dumping public schema (data)…"
pg_dump "$DATABASE_URL_DIRECT" \
  --schema=public \
  --data-only \
  --no-owner --no-privileges \
  --file "$OUT/public-data-$STAMP.sql"

echo "→ attempting auth schema dump (may fail; that's expected on hosted Supabase)…"
if pg_dump "$DATABASE_URL_DIRECT" \
     --schema=auth \
     --no-owner --no-privileges \
     --file "$OUT/auth-$STAMP.sql" 2>/dev/null; then
  echo "   auth schema dumped"
else
  rm -f "$OUT/auth-$STAMP.sql"
  echo "   auth schema not dumpable via this connection — use the dashboard CSV export"
  echo "   (Dashboard → Authentication → Users → … → Export users)"
fi

echo
echo "done. files in $OUT:"
ls -lh "$OUT/"
