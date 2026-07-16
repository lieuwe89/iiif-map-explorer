import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { WarpedMapLayer } from "@allmaps/maplibre";
import type { FootprintFeature, FootprintsIndex, FootprintProperties } from "@ime/interchange";
import { applyFilters, featureCenter, rankFeatures, type BBox, type Filters } from "./core/viewportFit";

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const DEFAULT_FILTERS: Filters = { yearMin: 1400, yearMax: 2025, sizeMin: 0.01, sizeMax: 100000, hideUndated: false };
const PAGE_SIZE = 25;
const EMPTY = { type: "FeatureCollection", features: [] } as const;

const fmtSize = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(v < 1 ? 2 : 1));
// IIIF thumbnail — width-constrained so aspect is always preserved (no squish), alpha corners intact.
const thumbOf = (id: string) => `https://images.memorix.nl/gra/iiif/${id}/full/300,/0/default.png`;

const bboxOf = (m: maplibregl.Map): BBox => {
  const b = m.getBounds();
  return { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() };
};

// Copy to clipboard, falling back to a hidden textarea where the async API is blocked
// (some iframes / non-secure contexts).
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// Two-thumb range slider on one shared track — the handles bump and can't cross
// (so the selection can never invert to "empty"). Works in the caller's numeric domain;
// the size filter passes log10 bounds and converts on change.
function DualRange({
  min,
  max,
  step,
  low,
  high,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
}) {
  const [active, setActive] = useState<"low" | "high" | null>(null);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="dual">
      <div className="dual-track" />
      <div className="dual-fill" style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={low}
        style={{ zIndex: active === "low" ? 5 : 3 }}
        onPointerDown={() => setActive("low")}
        onChange={(e) => onChange(Math.min(+e.target.value, high), high)}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={high}
        style={{ zIndex: active === "high" ? 5 : 4 }}
        onPointerDown={() => setActive("high")}
        onChange={(e) => onChange(low, Math.max(+e.target.value, low))}
      />
    </div>
  );
}

// Location search via Photon (komoot — free, no key, OSM data). Type-ahead, biased to
// Groningen; picking a result flies/fits the basemap there and drops a pin. The viewport-fit
// ranking then surfaces the Maps in view — search only moves the camera.
function GeoSearch({ map }: { map: { current: maplibregl.Map | null } }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<Record<string, any>>>([]);
  const [open, setOpen] = useState(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    timer.current = window.setTimeout(() => {
      fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en&lat=53.22&lon=6.57`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d) => {
          setResults(d.features ?? []);
          setOpen(true);
        })
        .catch(() => {});
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      ctrl.abort();
    };
  }, [q]);

  const mainLabel = (f: Record<string, any>) => {
    const p = f.properties ?? {};
    return [p.name, p.city, p.county, p.state, p.country]
      .filter((x: string, i: number, a: string[]) => x && a.indexOf(x) === i)
      .join(", ");
  };
  // Dropdown label adds the OSM type so same-named places are distinguishable.
  const label = (f: Record<string, any>) => {
    const k = f.properties?.osm_value;
    return mainLabel(f) + (k && k !== "yes" ? ` · ${k}` : "");
  };

  const pick = (f: Record<string, any>) => {
    const m = map.current;
    if (!m) return;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const ext = f.properties?.extent as number[] | undefined; // [west, north, east, south]
    if (ext && ext.length === 4) {
      m.fitBounds(
        [
          [ext[0], ext[3]],
          [ext[2], ext[1]],
        ],
        { padding: 64, maxZoom: 15, duration: 800 },
      );
    } else {
      m.flyTo({ center: [lon, lat], zoom: 13, duration: 800 });
    }
    markerRef.current?.remove();
    markerRef.current = new maplibregl.Marker({ color: "#1366d6" }).setLngLat([lon, lat]).addTo(m);
    setQ(mainLabel(f));
    setOpen(false);
  };
  const clear = () => {
    setQ("");
    setResults([]);
    setOpen(false);
    markerRef.current?.remove();
    markerRef.current = null;
  };

  return (
    <div className="geosearch">
      <div className="geo-input-wrap">
        <input
          type="text"
          placeholder="Search a place…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) pick(results[0]);
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        {q.length > 0 && (
          <button
            type="button"
            className="geo-clear"
            aria-label="Clear search"
            onMouseDown={(e) => {
              e.preventDefault();
              clear();
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="geo-results">
          {results.map((f, i) => (
            <li key={i} onMouseDown={() => pick(f)}>
              {label(f)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One-time (per visit) heads-up on small screens — the app is desktop-first.
function MobileNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem("ime-mobile-notice") === "dismissed";
    } catch {
      /* sessionStorage may be unavailable */
    }
    if (!dismissed && window.innerWidth < 640) setShow(true);
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem("ime-mobile-notice", "dismissed");
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  return (
    <div className="mobile-notice" role="dialog" aria-modal="true" onClick={dismiss}>
      <div className="mobile-notice-card" onClick={(e) => e.stopPropagation()}>
        <h2>Best on a larger screen</h2>
        <p>This map explorer works best on a larger screen — it’s usable on a phone, but a desktop or tablet gives you the full experience.</p>
        <button onClick={dismiss}>Continue anyway</button>
      </div>
    </div>
  );
}

export default function App() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const warpedRef = useRef<WarpedMapLayer | null>(null);
  const allRef = useRef<FootprintFeature[]>([]);
  const propsById = useRef<Map<string, FootprintProperties>>(new Map());
  const rankedRef = useRef<FootprintFeature[]>([]); // filtered + viewport-ranked, current view
  const drapedUrl = useRef<string | null>(null);
  const filtersRef = useRef<Filters>(DEFAULT_FILTERS);
  const pageRef = useRef(0);
  const selectedRef = useRef<FootprintProperties | null>(null);
  const toastTimer = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [total, setTotal] = useState(0);
  const [inView, setInView] = useState(0);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<FootprintProperties | null>(null);
  const [candidates, setCandidates] = useState<FootprintProperties[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.85);
  const [hideOutlines, setHideOutlines] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Render the current page slice (+ the pinned selection) into the GeoJSON source.
  const renderPage = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("fp")) return;
    const start = pageRef.current * PAGE_SIZE;
    const slice = rankedRef.current.slice(start, start + PAGE_SIZE);
    const sel = selectedRef.current;
    if (sel && !slice.some((f) => f.properties.id === sel.id)) {
      const selFeat = allRef.current.find((f) => f.properties.id === sel.id);
      if (selFeat) slice.push(selFeat);
    }
    (map.getSource("fp") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: slice,
    } as unknown as FeatureCollection);
    if (map.getLayer("fp-selected"))
      map.setFilter("fp-selected", ["==", ["get", "id"], sel ? sel.id : " "]);
  }, []);

  // Re-rank for the current viewport + filters; reset to the first page.
  const recompute = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const sticky = selectedRef.current ? new Set([selectedRef.current.id]) : new Set<string>();
    const filtered = applyFilters(allRef.current, filtersRef.current);
    rankedRef.current = rankFeatures(filtered, bboxOf(map), sticky);
    pageRef.current = 0;
    setInView(rankedRef.current.length);
    setPage(0);
    renderPage();
  }, [renderPage]);

  useEffect(() => {
    const map = new maplibregl.Map({ container: "map", style: OSM_STYLE, center: [6.57, 53.22], zoom: 8 });
    mapRef.current = map;

    map.on("load", async () => {
      const raw: FootprintsIndex = await fetch("/footprints.geojson").then((r) => r.json());
      allRef.current = raw.features;
      for (const ft of raw.features) propsById.current.set(ft.properties.id, ft.properties);
      setTotal(raw.features.length);

      map.addSource("fp", { type: "geojson", data: EMPTY as unknown as FeatureCollection, generateId: true });
      map.addSource("centroids", { type: "geojson", data: EMPTY as unknown as FeatureCollection });

      // Locator dots for every filtered Map (all zooms) — so you can see where Maps are, especially
      // the small ones, and know where to zoom in even when no outline qualifies for the current view.
      map.addLayer({
        id: "fp-dots",
        type: "circle",
        source: "centroids",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 1.6, 11, 3.2],
          "circle-color": "#ff2e88",
          "circle-opacity": 0.5,
        },
      });

      // Invisible fill = a full-footprint click/hover target (interaction ignores paint opacity);
      // tinted only on hover so outlines never compound into "pink soup".
      map.addLayer({
        id: "fp-fill",
        type: "fill",
        source: "fp",
        paint: {
          "fill-color": "#ff2e88",
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.12, 0],
        },
      });

      const warped = new WarpedMapLayer();
      map.addLayer(warped as unknown as maplibregl.LayerSpecification);
      warpedRef.current = warped;

      // Browse outlines, above the drape so they stay visible while a map is shown.
      map.addLayer({
        id: "fp-line",
        type: "line",
        source: "fp",
        paint: {
          "line-color": "#ff2e88",
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.2, 1.4],
          "line-opacity": 0.85,
        },
      });

      // The single selected Map, highlighted on top.
      map.addLayer({
        id: "fp-selected",
        type: "line",
        source: "fp",
        filter: ["==", ["get", "id"], " "],
        paint: { "line-color": "#ff2e88", "line-width": 3, "line-opacity": 1 },
      });

      // Highlight (blue) for the chooser row the cursor is over — shows which stacked Map is which.
      map.addLayer({
        id: "fp-hover",
        type: "line",
        source: "fp",
        filter: ["==", ["get", "id"], " "],
        paint: { "line-color": "#1366d6", "line-width": 4, "line-opacity": 1 },
      });

      let hoveredId: number | undefined;
      const clearHover = () => {
        if (hoveredId !== undefined) {
          map.setFeatureState({ source: "fp", id: hoveredId }, { hover: false });
          hoveredId = undefined;
        }
      };
      map.on("mousemove", "fp-fill", (e) => {
        if (!e.features?.length) return;
        clearHover();
        hoveredId = e.features[0].id as number;
        map.setFeatureState({ source: "fp", id: hoveredId }, { hover: true });
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "fp-fill", () => {
        clearHover();
        map.getCanvas().style.cursor = "";
      });

      map.on("click", ["fp-fill", "fp-line"], (e) => {
        const feats = e.features ?? [];
        if (!feats.length) return;
        // Every Map under the cursor (deduped), smallest first — a chooser for overlapping stacks.
        // The smallest auto-drapes (the most specific); the list lets you reach the others.
        const seen = new Set<string>();
        const cands: FootprintProperties[] = [];
        for (const f of feats) {
          const id = f.properties!.id as string;
          if (seen.has(id)) continue;
          seen.add(id);
          const p = propsById.current.get(id);
          if (p) cands.push(p);
        }
        cands.sort((a, b) => a.sizeKm2 - b.sizeKm2);
        setCandidates(cands);
        setSelected(cands[0] ?? null);
      });

      setReady(true);
      recompute();
      map.on("moveend", recompute);
    });

    return () => map.remove();
  }, [recompute]);

  // Drape ONLY the selected Map (replace any previous), pin it into the rendered set + highlight.
  useEffect(() => {
    selectedRef.current = selected;
    const map = mapRef.current;
    const w = warpedRef.current;
    if (!map || !w) return;
    if (drapedUrl.current) {
      w.removeGeoreferenceAnnotationByUrl(drapedUrl.current).catch(() => {});
      drapedUrl.current = null;
    }
    if (selected) {
      drapedUrl.current = "/" + selected.annotationUrl;
      w.addGeoreferenceAnnotationByUrl(drapedUrl.current).catch(() => {});
    }
    if (ready) renderPage();
  }, [selected, ready, renderPage]);

  useEffect(() => {
    filtersRef.current = filters;
    if (ready) recompute();
  }, [filters, ready, recompute]);

  // Locator dots = centroids of ALL filtered Maps (debounced; independent of the viewport).
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map || !map.getSource("centroids")) return;
    const id = setTimeout(() => {
      const pts = applyFilters(allRef.current, filters).map((f) => {
        const [x, y] = featureCenter(f);
        return { type: "Feature", geometry: { type: "Point", coordinates: [x, y] }, properties: {} };
      });
      (map.getSource("centroids") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: pts,
      } as unknown as FeatureCollection);
    }, 150);
    return () => clearTimeout(id);
  }, [filters, ready]);

  // Sidebar thumbnail = the ORIGINAL (non-georeferenced) scan, fetched per selection — the geotiff
  // asset we drape is warped (tilted in a nodata canvas), which looks squished as a thumbnail.
  useEffect(() => {
    setThumb(null);
    if (!selected) {
      setManifestUrl(null);
      return;
    }
    // Instant fallback: the IIIF image we drape (geotiff). Upgraded to the original scan below.
    setManifestUrl(`https://images.memorix.nl/gra/iiif/${selected.id}/info.json`);
    let cancelled = false;
    const K = "fd45b590-346a-11e5-a2cb-0800200c9a66";
    fetch(`https://webservices.memorix.nl/mediabank/media/${selected.recordId}?apiKey=${K}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const assets = (d?.media?.[0]?.asset ?? []) as Array<{ uuid: string; isgeotiff: boolean }>;
        const orig = assets.find((a) => !a.isgeotiff) ?? assets[0];
        if (orig) {
          setThumb(`https://images.memorix.nl/gra/iiif/${orig.uuid}/full/400,/0/default.jpg`);
          setManifestUrl(`https://images.memorix.nl/gra/iiif/${orig.uuid}/info.json`);
        } else {
          setThumb(thumbOf(selected.id));
        }
      })
      .catch(() => {
        if (!cancelled) setThumb(thumbOf(selected.id));
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("fp-hover")) map.setFilter("fp-hover", ["==", ["get", "id"], hoverId ?? " "]);
  }, [hoverId]);
  useEffect(() => {
    warpedRef.current?.setOpacity(opacity);
  }, [opacity]);

  // Hide all pink chrome (browse outlines, the draped map's highlight, locator dots) while a Map
  // is draped, so the warped imagery reads clean. fp-fill (invisible) stays, so you can still
  // click to drape another Map. Only takes effect when something is draped — otherwise the empty
  // basemap would have nothing on it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = hideOutlines && selected ? "none" : "visible";
    for (const id of ["fp-line", "fp-selected", "fp-dots"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
  }, [hideOutlines, selected, ready]);

  const pageCount = Math.max(1, Math.ceil(inView / PAGE_SIZE));
  const from = inView === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(inView, (page + 1) * PAGE_SIZE);
  const go = (d: number) => {
    const p = Math.min(pageCount - 1, Math.max(0, page + d));
    pageRef.current = p;
    setPage(p);
    renderPage();
  };
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };
  const copyManifest = () => {
    if (!manifestUrl) return;
    copyText(manifestUrl).then((ok) =>
      showToast(ok ? "IIIF manifest copied to clipboard" : "Couldn’t copy to clipboard"),
    );
  };

  return (
    <>
      <div id="map" />
      <GeoSearch map={mapRef} />
      <div className="panel">
        <h1>IIIF Map Explorer</h1>
        <div className="sub">
          Groningen · {total.toLocaleString()} georeferenced maps
        </div>

        <div className="row">
          <label>
            Year {filters.yearMin}–{filters.yearMax}
          </label>
          <DualRange
            min={1400}
            max={2025}
            step={1}
            low={filters.yearMin}
            high={filters.yearMax}
            onChange={(lo, hi) => setFilters((f) => ({ ...f, yearMin: lo, yearMax: hi }))}
          />
        </div>

        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={filters.hideUndated}
              onChange={(e) => setFilters((f) => ({ ...f, hideUndated: e.target.checked }))}
            />
            Hide maps without a known date
          </label>
        </div>

        <div className="row">
          <label>
            Map size {fmtSize(filters.sizeMin)}–{fmtSize(filters.sizeMax)} km²
          </label>
          <DualRange
            min={-2}
            max={5}
            step={0.1}
            low={Math.log10(Math.max(filters.sizeMin, 0.01))}
            high={Math.log10(Math.min(filters.sizeMax, 1e5))}
            onChange={(lo, hi) => setFilters((f) => ({ ...f, sizeMin: 10 ** lo, sizeMax: 10 ** hi }))}
          />
        </div>

        <div className="row">
          <label>Overlay opacity {opacity.toFixed(2)}</label>
          <input type="range" min={0} max={1} step={0.05} value={opacity} style={{ width: "100%" }}
            onChange={(e) => setOpacity(+e.target.value)} />
        </div>

        <div className="row">
          <label>
            Outlines {from}–{to} of {inView.toLocaleString()} in view
          </label>
          <div className="pager">
            <button onClick={() => go(-1)} disabled={page <= 0}>‹ Prev</button>
            <span className="sub" style={{ margin: 0 }}>
              page {page + 1} / {pageCount}
            </span>
            <button onClick={() => go(1)} disabled={page >= pageCount - 1}>Next ›</button>
          </div>
        </div>

        {candidates.length > 1 && (
          <div className="stack">
            <div className="sub" style={{ margin: "8px 0 4px" }}>
              {candidates.length} maps here — pick one:
            </div>
            <ul className="stacklist">
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className={selected?.id === c.id ? "on" : ""}
                  onClick={() => setSelected(c)}
                  onMouseEnter={() => setHoverId(c.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <span className="tt">{c.title || "(untitled)"}</span>
                  <span className="mm">{(c.dateStart ?? "?") + " · " + fmtSize(c.sizeKm2) + " km²"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {selected ? (
          <div className="sel">
            <div className="sel-hdr">Selected</div>
            {thumb ? <img src={thumb} alt="" /> : <div className="thumbph" />}
            <div className="t">{selected.title || "(untitled)"}</div>
            <div className="sub">
              {selected.dateStart ?? "?"}–{selected.dateEnd ?? "?"} · {selected.sizeKm2} km²
            </div>
            <a href={selected.sourceUrl} target="_blank" rel="noreferrer">View on Beeldbank ↗</a>
            <label className="check">
              <input
                type="checkbox"
                checked={hideOutlines}
                onChange={(e) => setHideOutlines(e.target.checked)}
              />
              Hide outlines while draped
            </label>
            <div className="pager" style={{ marginTop: 8 }}>
              <button onClick={copyManifest} disabled={!manifestUrl}>Get IIIF manifest</button>
              <button onClick={() => setSelected(null)}>✕ hide overlay</button>
            </div>
          </div>
        ) : (
          <div className="sub muted">Click an outline to drape that map.</div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
      <MobileNotice />
    </>
  );
}
