// Detect a Map's true (possibly rotated) outline inside its north-up canvas.
// The IIIF image is RGBA with transparent nodata corners, so the non-transparent region is the
// map. We take the convex hull of that region and simplify it to its corners — for a rotated
// rectangular scan this yields the 4 true corners. (Picking 4 extreme points instead degenerates
// to a triangle whenever a map is near axis-aligned: topmost and leftmost collapse to one corner.)
import { PNG } from "pngjs";

type Pt = [number, number];

/** Fetch a small IIIF PNG (alpha intact) for nodata detection. Retries on 429/5xx. */
export async function fetchReducedPng(assetId: string, width = 256): Promise<Buffer> {
  const url = `https://images.memorix.nl/gra/iiif/${assetId}/full/${width},/0/default.png`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

/** Andrew's monotone chain — convex hull, no repeated endpoint. */
function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts.slice();
  const ps = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Perpendicular distance from p to the line through a,b. */
function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Drop the least-significant hull vertices until every remaining corner is sharp (>eps), or 4 remain. */
function simplify(hull: Pt[], eps: number, maxPts: number): Pt[] {
  const h = hull.slice();
  while (h.length > 4) {
    let minD = Infinity, minI = -1;
    for (let i = 0; i < h.length; i++) {
      const d = perpDist(h[i], h[(i - 1 + h.length) % h.length], h[(i + 1) % h.length]);
      if (d < minD) { minD = d; minI = i; }
    }
    if (minI < 0 || (minD >= eps && h.length <= maxPts)) break;
    h.splice(minI, 1);
  }
  return h;
}

/**
 * The Map's outline as a simplified convex polygon in FULL-RES pixel coords (an open ring).
 * 4 points for a rotated rectangle; a few more for irregular scans.
 */
export function detectMaskPolygon(pngBuffer: Buffer, fullW: number, fullH: number): number[][] {
  const { width, height, data } = PNG.sync.read(pngBuffer);
  const ALPHA = 32;
  const pts: Pt[] = [];
  for (let y = 0; y < height; y++) {
    let lx = -1, rx = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA) {
        if (lx < 0) lx = x;
        rx = x;
      }
    }
    if (lx >= 0) {
      pts.push([lx, y]);
      if (rx !== lx) pts.push([rx, y]);
    }
  }
  if (pts.length < 3) throw new Error("no opaque pixels");
  const eps = Math.max(2, 0.02 * Math.max(width, height));
  const hull = simplify(convexHull(pts), eps, 16);
  if (hull.length < 3) throw new Error("degenerate mask");
  const sx = fullW / width, sy = fullH / height;
  return hull.map(([x, y]) => [Math.round(x * sx), Math.round(y * sy)]);
}
