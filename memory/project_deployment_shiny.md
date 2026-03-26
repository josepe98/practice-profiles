---
name: Deployment and Shiny rewrite plans
description: Two-track plan — deploy existing app online + build parallel Python Shiny version
type: project
---

Two tracks decided on 2026-03-26:

1. **Deploy existing React + FastAPI app online** — for immediate internal use by office colleagues. IT meeting happened 2026-03-25; specifics (on-prem vs cloud, auth requirements) TBD pending follow-up.

2. **Build a Python Shiny version** — parallel track. Scope (full parity vs simplified), repo structure, and whether it eventually replaces the React app are still TBD.

**Why:** Use this to avoid the "runs on my laptop" problem for the office.

**How to apply:** When working on deployment tasks, wait for IT specifics before building Docker/nginx config. When starting Shiny work, clarify scope and repo structure first.
