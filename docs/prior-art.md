# Prior art — georeferenced map explorers

Researched 2026-06-20 (web + GitHub + source inspection) to decide build-new vs adopt/contribute. Outcome: **[ADR-0004](adr/0004-build-new-on-allmaps-packages.md) — build new, on Allmaps' MIT packages.**

## Landscape

| Tool | Open source | Architecture | Density handling | Date/size filter | Generic / pluggable | Beeldbank |
|---|---|---|---|---|---|---|
| **Allmaps Explore** | App **GPL-3.0**; pkgs MIT | Static · MapLibre + **PMTiles** + `@allmaps/maplibre` | LOD outline bands (`mask-bands.ts`); warp on click; **no relevance gating** (sidebar = `slice(0,25)` by area); no cap/pager | **None** | Corpus-centric (Allmaps DB only); no adapter model | No |
| Allmaps Viewer / Latest / Here | Apps GPL-3.0 | Static, live WebGL warp | Single/few maps; "what's new" feeds | No | Any annotation URL | No |
| **NLS** Explore Georeferenced Maps | Source-available, **no OSI licence** | Static · OpenLayers · **pre-rendered raster tiles** | Sheet outlines + pick-one; series pre-mosaicked | **Date + scale** | Single-institution | No |
| **David Rumsey** Georeferencer | Proprietary (Klokan/MapTiler) | Backend · pre-rendered WMTS | **MapRank** relevance search (not mass draping) | **Date + scale** | Generic engine, closed | No |
| **OldMapsOnline / Georeferencer** | Proprietary | Backend · WMTS | **MapRank**: footprints ranked by area-overlap + scale + time | **Date + scale** | Multi-institution aggregator, closed | Territory yes; not a confirmed contributor |
| **Topotijdreis** | Proprietary (Kadaster/Esri); data CC-BY | Static client · Esri pre-mosaicked raster | One seamless mosaic per year; **year slider** | Year only | Single-source (NL topo) | National mosaic only |
| navPlace Viewer | Permissive (custom) | Static | Plots **point markers**, no warping | No | Generic | No |
| MapWarper / Wikimaps Warper / OHMG | GPL / OSS | **Backend-heavy** (Rails / Django+GeoServer) | Georeferencing **editors**, not explorers | — | Mostly single-collection | No |

## Verdict

**No existing tool occupies our quadrant: open + zero-backend static + live-warp + relevance-ranked & capped + date/size-filtered + source-agnostic adapters.**

- The one open tool on our stack — **Allmaps Explore** — deliberately omits our three differentiators (Viewport Fit ranking, Active Set + pager, date/size filters) and is **corpus-centric**: it shows only maps already in the Allmaps database. Beeldbank is georeferenced *outside* Allmaps and there is **no public bulk-ingest** for an existing annotation collection — so Explore cannot show it.
- The tools that *do* have relevance ranking + date/scale filters — the **Klokan/MapTiler** family (MapRank) — are **closed SaaS with server-side pre-rendered tiles**, the opposite of zero-backend live-warp.

**Validation, not duplication:** MapRank's "geographic-area similarity + scale + time" ranking is essentially our **Viewport Fit** (on-screen fraction + scale match) — independent confirmation that we're solving density the right way. Allmaps Explore's `mask-bands.ts` size-banded PMTiles outlines are the closest precedent for our LOD outline layer — study the *technique*, do not copy the GPL code.

**Beeldbank Groningen is an unfilled gap** across every viewer surveyed — a concrete reason for our first adapter.

## Licensing constraint

Allmaps **packages** (`@allmaps/maplibre`, `@allmaps/render`, `@allmaps/annotation`, `@allmaps/id`, …) are **MIT** — safe to depend on; the project stays MIT. Allmaps **apps** (Explore, Viewer, Latest, Here) are **GPL-3.0** — **do not copy app source**; reimplement patterns against the MIT packages.

> **Confirmed by live observation (2026-06-20).** Explore is naive. Zoomed out it draws *all* footprint outlines at once → visual chaos (thousands of overlapping pink lines, unreadable); no relevance-gated draping. The map outlines are **not clickable** — selection is via a side panel only. The side panel shows a thumbnail + "Show on map / Copy URL / viewer / editor" links but **almost no metadata** (no title, date, or maker), and there is **no date or size filter**. Selecting a map opens the Allmaps **Viewer**, which *does* warp the map in with an **opacity slider** and a **warped ⇄ original-image toggle** — two touches worth adopting. Net: every one of our differentiators holds, and the metadata + clickability gaps are bigger than expected.

## References
- Allmaps monorepo (apps GPL-3.0, packages MIT, data CC0): https://github.com/allmaps/allmaps · Explore https://dev.explore.allmaps.org/
- `@allmaps/maplibre` (MIT): https://allmaps.org/docs/ · Georeference Annotation spec: https://iiif.io/api/extension/georef/
- NLS https://maps.nls.uk/geo/explore/ · David Rumsey https://www.davidrumsey.com/view/maprank-search · OldMapsOnline https://www.oldmapsonline.org/ · MapRank https://www.mapranksearch.com/ · Topotijdreis https://www.topotijdreis.nl/
- MapWarper https://github.com/timwaters/mapwarper · navPlace Viewer https://github.com/CenterForDigitalHumanities/navplace-viewer · awesome-historical-maps https://github.com/stark1tty/awesome-historical-maps
