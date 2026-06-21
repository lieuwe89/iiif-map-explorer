# 0002. Georeference Annotations as the Source↔Explorer interchange

- **Status:** Accepted
- **Date:** 2026-06-20

## Context

The Explorer should be reusable for any georeferenced IIIF collection, not just Beeldbank Groningen — an open-source "IIIF map explorer." That needs a stable contract between a data Source and the frontend, so adding a collection means writing an adapter, not editing the Explorer.

Two formats were on the table:
- A **custom GeoJSON schema** (bbox + IIIF URL) with our own rectangular-overlay renderer. Simple, but Beeldbank-shaped (north-up rectangles), not interoperable, and it reinvents map warping.
- The **Georeference Annotation** (W3C Web Annotation / Allmaps schema): IIIF resource + GCPs + clipping mask. A published standard with mature client-side render libraries (`@allmaps/maplibre`, `@allmaps/leaflet`, `@allmaps/openlayers`) and an existing ecosystem (Allmaps Explore).

Our Maps are north-up rectangles, for which the custom format would suffice — but the explicit goal is genericity and open source, where other collections have truly warped, multi-GCP maps.

## Decision

We will use the **Georeference Annotation** as the interchange between every Source Adapter and the Explorer, and render Drapes with the **Allmaps** client libraries. The Explorer consumes two static artifacts per Source: a **Footprints Index** (bulk — outlines, filtering, Viewport Fit) and per-Map **Georeference Annotations** (lazy — draping). A Source Adapter's whole job is to produce those two artifacts.

## Consequences

The Explorer is source-agnostic by construction; adding a collection is an adapter, not a fork. Warping, tiling, and blending come from Allmaps for free, and we can ingest other collections' *existing* Allmaps annotations — and potentially contribute Beeldbank upstream. Everything stays static (annotations and index are files), preserving [ADR-0001](0001-zero-backend-static-architecture.md).

Costs accepted: a dependency on the `@allmaps/*` libraries and their annotation schema; the Beeldbank Adapter must synthesize annotations (4 corner GCPs + a rectangular mask) from GeoJP2 bounds even though the maps are simple rectangles; and the Explorer carries the generality to render arbitrary warped maps, which is more than Beeldbank strictly needs. The two-context split (Explorer vs Source Adapter — see [CONTEXT-MAP.md](../../CONTEXT-MAP.md)) follows directly from adopting this contract.
