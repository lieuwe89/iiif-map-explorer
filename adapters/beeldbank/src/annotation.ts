// Build a Georeference Annotation (Allmaps/W3C) from the detected map-corner quad.
// pixelCorners[i] (in the scan) maps to geoCorners[i] (on the globe); same order, a ring.
import { generateAnnotation } from "@allmaps/annotation";

/** Closed GeoJSON ring from the 4 (possibly rotated) geographic corners. */
export function footprintPolygon(geoCorners: number[][]): number[][][] {
  return [[...geoCorners, geoCorners[0]]];
}

/** True area of the (rotated) quad in km² — shoelace in a local equirectangular projection. */
export function sizeKm2(geoCorners: number[][]): number {
  const latMid = (geoCorners.reduce((s, c) => s + c[1], 0) / geoCorners.length) * (Math.PI / 180);
  const kx = 111.32 * Math.cos(latMid);
  const ky = 110.57;
  const p = geoCorners.map((c) => [c[0] * kx, c[1] * ky]);
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function buildAnnotation(
  assetId: string,
  width: number,
  height: number,
  pixelCorners: number[][],
  geoCorners: number[][],
) {
  const georeferencedMap = {
    "@context": "https://schemas.allmaps.org/map/2/context.json",
    type: "GeoreferencedMap",
    resource: {
      id: `https://images.memorix.nl/gra/iiif/${assetId}`,
      type: "ImageService2",
      width,
      height,
    },
    gcps: pixelCorners.map((p, i) => ({ resource: p, geo: geoCorners[i] })),
    resourceMask: pixelCorners,
  };
  return generateAnnotation(georeferencedMap as any);
}
