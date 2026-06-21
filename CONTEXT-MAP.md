# Context Map — IIIF Map Explorer

> A generic, zero-backend explorer for georeferenced maps published as IIIF, plus pluggable per-Source adapters. Beeldbank Groningen is the first Source.

This repo has two bounded contexts. They share one contract — the **interchange** — and otherwise speak different languages.

## Contexts

| Context | Lives in | Responsible for | Glossary |
|---------|----------|-----------------|----------|
| **Explorer** | `explorer/` | The generic frontend: browse, filter, outline, Drape. Source-agnostic. | [explorer/CONTEXT.md](explorer/CONTEXT.md) |
| **Source Adapter** | `adapters/<source>/` | Turning one Source's holdings into the interchange. First: Beeldbank Groningen. | [adapters/beeldbank/CONTEXT.md](adapters/beeldbank/CONTEXT.md) |

System-wide decisions live in [docs/adr/](docs/adr/). A context's own decisions (if any) live in that context's `docs/adr/`.

## Shared interchange — the contract between the contexts

Both contexts agree on exactly these terms. An Adapter **produces** them; the Explorer **consumes** them. Nothing else crosses the boundary.

### Map
A single georeferenced historical map: a IIIF image resource plus a georeference (control points → world coordinates). The unit a user browses and Drapes. Not the modern reference map — that is the Explorer's *Basemap*.

### Source
A provider/collection of Maps (e.g. Beeldbank Groningen). Each Source has one Adapter that emits the interchange for it. Adding a Source never changes the Explorer.

### Georeference Annotation
The per-Map interchange object (W3C Web Annotation / Allmaps schema): the IIIF resource URL, the ground control points (GCPs), and the clipping-mask polygon. Everything needed to Drape one Map; the Explorer hands it to the Allmaps render layer.

### Footprint
The geographic polygon a Map covers — the Georeference Annotation's clipping mask in world coordinates. Drives outlines, filtering, and Viewport Fit. A polygon, never a point.

### Footprints Index
One lightweight bulk artifact listing every Map's Footprint plus minimal properties (id, title, date range, Map Size, Source link, Georeference Annotation URL). The Explorer loads it to draw outlines and run all filtering; the heavier Annotations are fetched lazily, per Map, only to Drape.
