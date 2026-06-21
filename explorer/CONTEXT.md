# Explorer — Ubiquitous Language

> The generic frontend: browse a Source's Maps on a Basemap, filter them, show Outlines, and Drape a selected Map. Knows nothing about any specific Source — it consumes only the shared interchange (see [../CONTEXT-MAP.md](../CONTEXT-MAP.md)).

## Glossary

### Basemap
The modern slippy reference map (e.g. OpenStreetMap) rendered underneath the Maps. A reference layer only, never the subject. The word "map" alone always means a historical Map, never the Basemap.

### Drape (verb) / Overlay (noun)
To **Drape** a Map is to render its IIIF imagery on the Basemap, positioned by its Footprint and usually semi-transparent. The **Overlay** is the draped result. Draping is not the same as showing an outline: the outline is the Footprint with no imagery.

### Outline
The always-visible representation of a Map: its Footprint drawn as a rectangle on the Basemap (no imagery). Outlines are **size-banded** by zoom — the largest Maps show when zoomed out, smaller ones appear as you zoom in — so a dense corpus never becomes an unreadable tangle. The Beeldbank's georeferencing is north-up, so Outlines are axis-aligned rectangles; it stores no rotation. (A true rotated outline would need GCP-based georeferencing, which the Source does not provide.)

### Selected Map
The single Map the user has clicked — the **only** Map that is Draped. Clicking never auto-drapes nearby Maps; draping is always a deliberate selection. (This replaced an earlier auto-draping design driven by a "Viewport Fit" relevance score and a capped "Active Set" — accurate, but visually chaotic at scale.) When several Outlines overlap under the cursor, the **smallest** (most specific) Map is selected, not the large sheet covering everything. Selecting another Map replaces the Overlay; hiding it clears the Overlay.

### Map Size
The ground area a Map's Footprint covers (km²), used for filtering (detailed local Maps vs whole-province sheets). Distinct from the IIIF image's pixel dimensions.
