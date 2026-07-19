# Supabase migration export

Everything we'd lose if the Supabase project (`mnolwntsggaofuwyigej`) is paused or deleted. Run this **before** the project goes dark.

## Prerequisites

- `pg_dump` 16+ (`brew install postgresql@16` if missing)
- The **direct** Supabase connection string — port 5432, not the transaction pooler at 6543. Supabase Dashboard → Project Settings → Database → "Direct connection" or "Session pooler".

## 1. Database dump

```bash
export DATABASE_URL_DIRECT='postgresql://postgres.mnolwntsggaofuwyigej:yXojHOVYPvt0zuLF@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
./migration/export.sh
```

postgresql://postgres.mnolwntsggaofuwyigej:yXojHOVYPvt0zuLF@aws-1-us-east-1.pooler.supabase.com:5432/postgres

Writes to `migration/dumps/` (gitignored):

- `public-schema-*.sql` — table DDL for our ~10 tables
- `public-data-*.sql` — every row, dumped in a single transaction for consistency
- `auth-*.sql` — auth schema if accessible (usually not; the script falls back gracefully)

## 2. Auth users

**Skipped intentionally.** Only two users exist; the on-prem target will have its own auth (likely SSO/IdP), so both will create new credentials there. No CSV export needed.

The full `auth` schema did dump in step 1 (`auth-*.sql`) as a fallback if we ever need to look up an email or metadata.

## 3. Project config snapshot

These don't appear in any dump. Screenshot or copy each into `migration/dumps/config/`:

- Authentication → URL Configuration (Site URL, Redirect URLs)
- Authentication → Email Templates (invite, reset, confirm)
- Authentication → Providers (which are enabled)
- Project Settings → API (JWT alg = ES256, JWKS URL)
- Project Settings → General (project ID, region)

## 4. Check the rarely-used surfaces

- **Storage → Buckets** — memory says we don't use it; confirm and download anything that's there.
- **Edge Functions** — memory says we don't use them; confirm and copy code if present.
- **Database → Replication** — should be empty (no Realtime).

## Notes

- `dumps/` is gitignored. The data and user list must not land in the repo.
- Dump filenames are UTC-timestamped so re-runs append instead of clobbering.
- RLS policies on `public.*` are deny-all with no policies (per memory). Trivial to recreate; the schema dump won't include them since `--no-privileges` strips grants.
