# IIIF Map Explorer

A generic, **zero-backend** web app for browsing large collections of georeferenced historical maps published as IIIF — drape the maps onto a modern slippy map, filter them, and explore.

**▶ Live: [mapexplorer.lieuwejongsma.nl](https://mapexplorer.lieuwejongsma.nl)** — the first deployment, the **Groninger Archieven Beeldbank** (16,010 georeferenced maps). The Explorer itself is source-agnostic: adding another collection means writing a small *Source Adapter*, not touching the frontend.

> **Status:** Live. The full Beeldbank collection is harvested (16,010 maps of the 16,106 enumerated — the rest are out-of-region or have degenerate georeferencing and are rejected at source) and the Explorer is deployed as a static site. Bounds match GDAL, ~16 KB is read per map (not the full ~10 MB image), and every Georeference Annotation round-trips through Allmaps' own parser.

## What it does

- Shows map **outlines** (Footprints) at their true, rotated angle — recovered from each scan's transparent (nodata) border, not axis-aligned boxes.
- Keeps the view legible: only the outlines that best **fit the current viewport** are drawn (ranked, 25 at a time, with a **prev/next pager**) — so dense areas never become chaos. **Locator dots** mark every filtered map so you can see where they are and zoom in.
- **Click an outline → drapes that map** as live, warped IIIF imagery, with an **opacity slider**. Click a crowded spot and a **chooser** lists every map stacked there (hover a row to highlight it, click to drape).
- Filters by **date** and **map size** with dual-handle range sliders (the handles bump rather than cross), and can hide maps with no known date.
- A metadata panel: title, date, size, the **original (non-warped) scan** as a thumbnail, a link back to the source, and one-click copy of the map's **IIIF image manifest** (the Image API `info.json`).

## Architecture

Two bounded contexts, one contract between them — see **[CONTEXT-MAP.md](CONTEXT-MAP.md)**:

- **Explorer** (`explorer/`) — the generic React frontend. Consumes only the interchange.
- **Source Adapter** (`adapters/<source>/`) — turns one collection into the interchange. First: `adapters/beeldbank/`.

The interchange is the **Georeference Annotation** (W3C / Allmaps): each map is one annotation (IIIF resource + GCPs + clipping mask). An Adapter produces a lightweight **Footprints Index** (bulk, for outlines/filtering) plus per-map annotations (lazy, for draping). Everything is static files.

Key decisions are recorded as ADRs in [docs/adr/](docs/adr/):
- [0001](docs/adr/0001-zero-backend-static-architecture.md) — zero-backend, static frontend + offline harvester
- [0002](docs/adr/0002-georeference-annotation-interchange.md) — Georeference Annotations as the interchange
- [0003](docs/adr/0003-stream-geojp2-front-box.md) — harvest GeoJP2 georeferencing by streaming the front box
- [0004](docs/adr/0004-build-new-on-allmaps-packages.md) — build new on Allmaps' MIT packages

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | React + Vite + TypeScript (plain CSS), static SPA |
| Map engine | MapLibre GL JS |
| Draping | `@allmaps/maplibre` (`WarpedMapLayer`) |
| Footprints | in-memory GeoJSON, viewport-fit ranked + paged (≤25 drawn at once) |
| Basemap | OpenStreetMap raster tiles |
| Harvester | Node + TypeScript (shares the interchange types with the Explorer) |
| Hosting | Caddy static `file_server` on a VPS, auto-TLS (Let's Encrypt); `rsync` deploy |

The Explorer's core (Viewport Fit, filtering, Allmaps wiring) lives in framework-agnostic TypeScript modules; React is only the UI shell.

## Build & run

```bash
npm install
npm run dev   --workspace=@ime/explorer    # local dev server (Vite)
npm run build --workspace=@ime/explorer    # static site → explorer/dist/
```

The Explorer reads a Footprints Index + per-map annotations from `explorer/public/`. Generate them with the Beeldbank adapter (it writes to `adapters/beeldbank/out/`; copy `footprints.geojson` + `annotations/` into `explorer/public/`):

```bash
LIMIT=20000 CONC=4 npm run harvest --workspace=@ime/adapter-beeldbank
```

VPS deploy steps are in [explorer/deploy/DEPLOY.md](explorer/deploy/DEPLOY.md).

## Adding a Source

Write an adapter under `adapters/<source>/` that emits two static artifacts for the collection:
1. a **Footprints Index** (every map's outline polygon + minimal metadata + annotation URL), and
2. one **Georeference Annotation** per map.

The Explorer is unchanged. See `adapters/beeldbank/` for the reference implementation and [adapters/beeldbank/CONTEXT.md](adapters/beeldbank/CONTEXT.md) for how it maps a Picturae/Memorix collection onto the interchange.

## Prior art

A [survey of existing georeferenced-map explorers](docs/prior-art.md) found that none occupies this project's quadrant — open + zero-backend static + live-warp + relevance-ranked/capped + date/size-filtered + source-agnostic adapters. The closest, **Allmaps Explore**, lacks the selection/filter features and can't show Beeldbank; the tools that have ranking + filters are closed SaaS. See [ADR-0004](docs/adr/0004-build-new-on-allmaps-packages.md).

## License

[MIT](LICENSE) © 2026 Lieuwe Jongsma

Built on Allmaps' **MIT** packages (`@allmaps/maplibre`, `@allmaps/render`, `@allmaps/annotation`). The Allmaps *apps* (Explore, Viewer) are **GPL-3.0** and are referenced for technique only, never copied.
