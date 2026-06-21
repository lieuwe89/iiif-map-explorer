# Beeldbank Adapter — Ubiquitous Language

> Turns the Groninger Archieven Beeldbank (Picturae/Memorix) into the shared interchange: enumerate its georeferenced Maps and emit a Footprints Index plus one Georeference Annotation per Map. None of the terms below reach the Explorer — they stop at the interchange (see [../../CONTEXT-MAP.md](../../CONTEXT-MAP.md)).

## Glossary

### Record / Record-UUID
The Beeldbank's descriptive catalogue entry for an item (title, date, maker, location, geodata), identified by a **Record-UUID** and served by the Memorix API. One Record may point to several Assets. Supplies a Map's descriptive properties in the interchange.

### Asset / Asset-UUID
The digital file behind a Record, identified by an **Asset-UUID** — the key for the IIIF Image API and thumbnails. Carries the `isgeotiff` flag and pixel dimensions. An Asset (not its Record) becomes the Map's IIIF resource in the Georeference Annotation.

### isgeotiff
The Beeldbank's per-Asset boolean marking an Asset as georeferenced. The Adapter treats every Asset with `isgeotiff: true` as a Map (~16,106 of them). A Beeldbank concept only; it never reaches the Explorer — only the resulting Georeference Annotation does.

### Centroid
The single lat/lng point a Record exposes via `mapdata.center`. A coarse locator only — not the Footprint. The Adapter must still derive the true Footprint from the GeoJP2.

### GeoJP2
The downloadable JPEG-2000 file for a Map. Its embedded GeoTIFF tags — held in a UUID box at the very front of the file (within the first ~0.5 KB, before the image data) — carry the Map's real pixel→world transform, a north-up affine for the Beeldbank. The only source of the Footprint; it appears in no JSON API. *How* the Adapter reads it (streaming the file and aborting early, since the server has no range support) is an implementation concern — see [ADR-0003](../../docs/adr/0003-stream-geojp2-front-box.md).

### Memorix API
The Picturae Mediabank API (`webservices.memorix.nl/mediabank/`) the Adapter pages to enumerate Records/Assets and read metadata. Solr-backed: `q`, `rows`, `page`, `fq[]=field:value`, `facetFields[]`.
