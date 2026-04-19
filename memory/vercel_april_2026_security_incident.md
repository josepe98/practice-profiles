---
name: Vercel April 2026 security incident
description: Vercel disclosed unauthorized access to internal systems on 2026-04-19; action items for this repo's Vercel-hosted frontend
type: security
---

**Source:** Vercel security bulletin, last updated 2026-04-19.

**What happened:** Unauthorized access to certain internal Vercel systems. Origin traced to a small third-party AI tool whose Google Workspace OAuth app was compromised. Vercel has engaged incident response, notified law enforcement, and says only a limited subset of customers were impacted (they are being contacted directly). Services remain operational.

**Why it matters here:** The frontend in `frontend/` deploys to Vercel (see `frontend/vercel.json`). Vercel project env vars used by this app include, at minimum:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`
- `VITE_API_BASE_URL`

Backend secrets (`DATABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_URL`, `MAPBOX_TOKEN`, `CENSUS_API_KEY`) live on Railway, not Vercel, so they are out of scope unless they were also mirrored into Vercel at any point.

**Action items:**

1. Check whether we received a direct notice from Vercel indicating this project was in the impacted subset. If yes, escalate.
2. Review the Vercel activity log (https://vercel.com/activity-log or `vercel activity` CLI) for suspicious deployments, env var reads, or team membership changes over the past ~30 days.
3. In the Google Workspace admin console, search for the IOC OAuth client ID `110671459871-30f1spbu0hptbs60cb4vsmv79i7bbvqj.apps.googleusercontent.com` and revoke/investigate any grants.
4. Rotate any Vercel-stored secrets that were **not** marked "sensitive" — per Vercel, sensitive-marked values are write-only and no evidence they were read, but non-sensitive values should be treated as potentially exposed.
    - `VITE_*` values are bundled into the client build and are already public by design; rotation has limited security value but is still cheap (especially for `VITE_MAPBOX_TOKEN`, which should have URL restrictions in Mapbox).
    - If any backend secrets were ever copied into Vercel env vars, rotate those in Railway + Supabase + Mapbox + Census as appropriate.
5. Going forward, mark any non-public env var added to Vercel as **sensitive** (https://vercel.com/docs/environment-variables/sensitive-environment-variables).

**IOC:** `110671459871-30f1spbu0hptbs60cb4vsmv79i7bbvqj.apps.googleusercontent.com`

**Follow-up:** Re-check the Vercel bulletin page for updates; this file reflects the 2026-04-19 snapshot only.
