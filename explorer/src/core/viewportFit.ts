// Framework-agnostic core: Viewport Fit scoring, Active Set ranking, filtering.
// See explorer/CONTEXT.md for the definitions of Viewport Fit and Active Set.
import type { FootprintFeature } from "@ime/interchange";

export interface BBox {
  w: number;
  s: number;
  e: number;
  n: number;
}

export function featureBBox(f: FootprintFeature): BBox {
  const ring = f.geometry.coordinates[0];
  let w = 180,
    s = 90,
    e = -180,
    n = -90;
  for (const [x, y] of ring) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return { w, s, e, n };
}

export function featureCenter(f: FootprintFeature): [number, number] {
  const b = featureBBox(f);
  return [(b.w + b.e) / 2, (b.s + b.n) / 2];
}

const area = (b: BBox) => Math.max(0, b.e - b.w) * Math.max(0, b.n - b.s);

function intersectionArea(a: BBox, b: BBox): number {
  const w = Math.max(a.w, b.w);
  const s = Math.max(a.s, b.s);
  const e = Math.min(a.e, b.e);
  const n = Math.min(a.n, b.n);
  return Math.max(0, e - w) * Math.max(0, n - s);
}

/**
 * Viewport Fit — prefer Maps that sit INSIDE the current view.
 * containment = fraction of the Footprint that is on-screen (1 = fully inside).
 * coverage    = fraction of the viewport the Footprint fills.
 * Squaring containment strongly demotes Maps that mostly spill outside the viewport
 * (the "loaded a map that's mostly off-screen" complaint); coverage then prefers the
 * largest Map that still fits. When nothing fits cleanly (zoomed in past every Map's
 * size) the least-overflowing — i.e. smallest — Maps win, so the set keeps filling.
 */
export function viewportFit(fp: BBox, vp: BBox): number {
  const i = intersectionArea(fp, vp);
  if (i <= 0) return 0;
  const fa = area(fp);
  const va = area(vp);
  if (fa <= 0 || va <= 0) return 0;
  const containment = i / fa;
  const coverage = i / va;
  return containment * containment * coverage;
}

export interface Filters {
  yearMin: number;
  yearMax: number;
  sizeMin: number;
  sizeMax: number;
  hideUndated: boolean;
}

export function applyFilters(features: FootprintFeature[], f: Filters): FootprintFeature[] {
  return features.filter((ft) => {
    const p = ft.properties;
    const dateOk =
      p.dateStart != null
        ? p.dateStart <= f.yearMax && (p.dateEnd ?? p.dateStart) >= f.yearMin
        : !f.hideUndated;
    const sizeOk = p.sizeKm2 >= f.sizeMin && p.sizeKm2 <= f.sizeMax;
    return dateOk && sizeOk;
  });
}

export interface Scored {
  feature: FootprintFeature;
  fit: number;
}

/**
 * Rank Maps by Viewport Fit. `sticky` (the currently-draped ids) get a fit bonus
 * so the Active Set has hysteresis — a draped Map stays unless a clearly better
 * one displaces it, preventing flicker on small pan/zoom.
 */
export function rankFeatures(features: FootprintFeature[], vp: BBox, sticky: Set<string>): Scored[] {
  const out: Scored[] = [];
  for (const f of features) {
    let fit = viewportFit(featureBBox(f), vp);
    if (fit <= 0) continue;
    if (sticky.has(f.properties.id)) fit *= 1.35;
    out.push({ feature: f, fit });
  }
  out.sort((a, b) => b.fit - a.fit);
  return out;
}
