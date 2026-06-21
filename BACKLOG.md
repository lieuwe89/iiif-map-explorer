# Backlog

Parking lot for deferred ideas. Not committed scope.

## ✅ Prior-art / competitive research — DONE (2026-06-20)
Full survey: [docs/prior-art.md](docs/prior-art.md). Decision: [ADR-0004](docs/adr/0004-build-new-on-allmaps-packages.md) — **build new** on Allmaps' MIT packages. No tool occupies our quadrant (open + static + live-warp + relevance-ranked/capped + date/size-filtered + adapters); closest is Allmaps Explore (GPL apps), which lacks our selection/filter features and can't show Beeldbank.
- *Confirmed (2026-06-20, live):* Explore is naive — outline chaos when zoomed out, outlines not clickable, almost no metadata, no date/size filters. Verdict holds; differentiators are stronger than expected.

## Optional — contribute Beeldbank upstream to the Allmaps commons
A separate, slower track (not a substitute for building): get the ~16k Beeldbank annotations into the Allmaps database so they also surface in Allmaps Explore. No public bulk-ingest exists for *pre-georeferenced* collections — paths are the IIIF Partnership / Allmaps Curator, or a harvest-style Editor workflow (cf. the State Library of Victoria precedent).

## Documentation — for open-source release
- Thorough `README`: what it is, screenshots/demo, supported Sources, how to host (static).
- **Source-adapter authoring guide**: input (IIIF image + georeference) → output (interchange format). Make adding a collection a documented, repeatable task.
- Architecture overview + link the ADRs.
- `LICENSE` (choose), `CONTRIBUTING`, live demo deployment.

## Optional, later
- Shared tile/thumbnail caching proxy (kinder to source servers, faster repeat views) — addable behind the static frontend without rework.
