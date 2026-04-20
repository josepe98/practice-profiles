---
name: Vercel April 2026 security incident
description: Vercel disclosed unauthorized access to internal systems on 2026-04-19; action items for this repo's Vercel-hosted frontend
type: security
---

**Source:** Vercel security bulletin, last updated 2026-04-19, plus a direct customer email from Vercel received 2026-04-20.

**What happened:** Unauthorized access to certain internal Vercel systems. Origin traced to a small third-party AI tool whose Google Workspace OAuth app was compromised. Vercel has engaged incident response, notified law enforcement, and says only a limited subset of customers were impacted (they are being contacted directly). Services remain operational.

**Our status (per direct email from Vercel, 2026-04-20):** "At this time, we do not have reason to believe that your Vercel credentials or personal data have been compromised." Vercel is still investigating whether any data was exfiltrated and will contact us again if that changes. No emergency rotation required; standard best practices below still apply.

**Why it matters here:** The frontend in `frontend/` deploys to Vercel (see `frontend/vercel.json`). Vercel project env vars used by this app include, at minimum:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`
- `VITE_API_BASE_URL`

Backend secrets (`DATABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_URL`, `MAPBOX_TOKEN`, `CENSUS_API_KEY`) live on Railway, not Vercel, so they are out of scope unless they were also mirrored into Vercel at any point.

**Action items (no emergency rotation required given Vercel's direct notice, but do the hygiene passes):**

1. Review the Vercel activity log (https://vercel.com/activity-log or `vercel activity` CLI) for suspicious deployments, env var reads, or team membership changes over the past ~30 days.
2. In the Google Workspace admin console, search for the IOC OAuth client ID `110671459871-30f1spbu0hptbs60cb4vsmv79i7bbvqj.apps.googleusercontent.com` and revoke/investigate any grants.
3. Mark any non-public env var currently in Vercel as **sensitive** (https://vercel.com/docs/environment-variables/sensitive-environment-variables), and do the same for any new ones going forward.
4. Optional rotation of Vercel-stored values as a precaution:
    - `VITE_*` values are bundled into the client build and already public by design; rotation has limited security value. `VITE_MAPBOX_TOKEN` should have URL restrictions configured in Mapbox regardless.
    - If any backend secrets were ever copied into Vercel env vars, rotate those in Railway + Supabase + Mapbox + Census as appropriate.
5. Watch for a follow-up email from Vercel — they said they will contact us again if evidence of compromise emerges.

**IOC:** `110671459871-30f1spbu0hptbs60cb4vsmv79i7bbvqj.apps.googleusercontent.com`

**Follow-up:** Re-check the Vercel bulletin page for updates; this file reflects the 2026-04-19 snapshot only.
