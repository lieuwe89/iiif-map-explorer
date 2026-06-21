# 0004. Build new, on Allmaps' MIT packages — do not fork Allmaps Explore

- **Status:** Accepted
- **Date:** 2026-06-20

## Context

Before writing code we surveyed existing georeferenced-map explorers to decide build-new vs adopt vs contribute (full survey: [prior-art.md](../prior-art.md)). The closest match, **Allmaps Explore**, shares our exact stack (MapLibre + PMTiles + `@allmaps/maplibre`, static) and is source-agnostic within the Allmaps corpus. The only tools with relevance ranking + date/scale filters (the Klokan/MapTiler "MapRank" family) are closed SaaS with server-side pre-rendered tiles.

Two facts decide it:
- **No tool occupies our quadrant** — open + zero-backend static + live-warp + relevance-ranked/capped + date/size-filtered + pluggable adapters. Allmaps Explore omits Viewport-Fit ranking, the Active Set cap/pager, and date/size filters, and is **corpus-centric**: it shows only maps in the Allmaps database. Beeldbank is georeferenced outside Allmaps and has **no public bulk-ingest path**, so Explore cannot display it.
- **Licensing**: Allmaps *packages* are MIT, but the *apps* (Explore, Viewer, Latest, Here) are **GPL-3.0**.

Alternatives: (a) adopt Allmaps Explore as-is; (b) contribute Beeldbank into Allmaps and skip building; (c) build new.

## Decision

**Build new** (option c), reusing Allmaps' **MIT packages** (`@allmaps/maplibre`, `@allmaps/render`, `@allmaps/annotation`, `@allmaps/id`) for warping and annotation handling — but **not forking or copying the GPL-3.0 Allmaps app code**. Our net-new value is the selection/LOD layer: Viewport Fit, Active Set + pager, date and Map Size filters, and the pluggable Source-Adapter model for arbitrary external annotation collections.

## Consequences

The project stays MIT and we avoid reinventing WebGL map-warping (the hardest part) while owning the differentiators. We must reimplement Explore-like patterns (e.g. its `mask-bands.ts` outline LOD) ourselves against the MIT packages rather than lifting GPL source. 

Adopting (a) was impossible — it can't show Beeldbank, lacks every selection/filter feature, and forking a GPL app would force this project to GPL. Contributing upstream (b) remains a worthwhile **parallel** track — getting Beeldbank into the Allmaps commons via the IIIF Partnership / Allmaps Curator or a harvest-style Editor workflow — but it is slow and delivers none of our UX, so it is a backlog item, not a substitute for building. One residual check is logged in prior-art.md: confirm in a real browser that Explore does no relevance-gated draping before treating Viewport Fit as the headline differentiator.
