# 0003. Harvest GeoJP2 georeferencing by streaming the file's front box

- **Status:** Accepted
- **Date:** 2026-06-20

## Context

The Beeldbank Adapter must read each Map's pixel→world transform from its GeoJP2 to build the Footprint and GCPs. That transform is in no JSON API; it exists only inside the downloadable GeoJP2.

The obvious approach — GDAL `/vsicurl` reading only the file's header via HTTP range requests — **does not work here**. The download server (`images.memorix.nl/.../download/mediabank/...`) ignores the `Range` header and responds `200` with the full body, so GDAL fails: *"Range downloading not supported by this server."*

Measured facts (spike, 2026-06-20, asset `4ef5cbb0…`): the JP2 files average ~10 MB, so pulling all ~16,106 in full moves ~160 GB. But the GeoJP2 UUID box sits at **byte offset ~145** — the whole georeference is in the first ~0.5 KB, before the JP2 codestream. GDAL reads the geo correctly from a locally-held file.

Alternatives weighed: (a) download each file in full, then `gdalinfo`/`rasterio`; (b) stream each file and abort after the first few KB, parsing the front GeoJP2 box; (c) `/vsicurl` range reads — does not work on this server.

## Decision

The Adapter will **stream each GeoJP2 and stop reading after the first few KB**, parsing the GeoTIFF tags (`ModelPixelScale`, `ModelTiepoint`, `GeoKeys`) from the front UUID box to derive bounds and GCPs. It will not download the full image.

## Consequences

Harvest transfer drops from ~160 GB to tens of MB — a full harvest is fast and incremental refreshes are cheap, keeping the dataset fresh under [ADR-0001](0001-zero-backend-static-architecture.md). 

Costs accepted: a small custom GeoJP2/TIFF-tag parser (or feeding the front bytes to GDAL via an in-memory `/vsimem` file) instead of a one-line `gdalinfo`; and a reliance on the geo box staying at the front of the file (true for every Beeldbank GeoJP2 sampled — a file that placed it after the codestream would fall back to a full download). **Do not "simplify" this to `gdalinfo /vsicurl`** — the server's lack of range support makes that fail outright.
