# 0001. Zero-backend, static frontend + offline harvester

- **Status:** Accepted
- **Date:** 2026-06-20

## Context

The app browses ~16,000 georeferenced historical Maps from the Groninger Archieven Beeldbank, draping their IIIF imagery on a slippy Basemap.

Three measured facts shape the choice:

1. The Beeldbank IIIF Image API is live and serves tiles with `Access-Control-Allow-Origin: *`. A browser can fetch tiles directly from `images.memorix.nl` — no proxy required.
2. Because tiles load in the visitor's browser, the source server's ≤10 req/s rate limit is **per-visitor** (their IP), not a shared server bottleneck.
3. The full set of Maps is a few MB of footprint + metadata JSON. Date, size, and Viewport-Fit filtering all run client-side; there is no need for a server-side search index at this scale.

The only inherently server-side work is **offline**: enumerating the Maps and extracting each Footprint from its GeoJP2, which produces a static dataset rather than serving live requests.

Alternatives considered: (a) a Node/Express backend that proxies tiles and serves search; (b) a pure static frontend plus an offline harvester.

## Decision

We will ship a **pure static frontend** (HTML/JS + a harvested dataset file) served by nginx, plus an **offline harvester** run on a schedule that regenerates the dataset. No application server, no database, no tile proxy.

## Consequences

Near-zero hosting cost and operations; the site is a folder of files, trivially cacheable/CDN-able and trivial to deploy on the VPS. 

Costs we knowingly accept:
- No shared tile cache — each visitor hits the source server directly, so the frontend must **self-throttle its tile queue (~8 req/s)** to avoid per-user 429s.
- The dataset is a **static snapshot**; freshness depends on re-running the harvester (planned: periodic cron).
- Any future feature that needs server state (accounts, crowd-sourced georeferencing, server-side search at much larger scale) would require revisiting this decision.

A shared caching proxy can be added later **behind the same static frontend** without rework, so this decision is cheap to soften if needed.
