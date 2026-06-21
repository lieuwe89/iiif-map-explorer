// Spot-check mask detection across a spread of maps (no output written).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchGeoJp2Head, boundsFromGeoJp2 } from "./geojp2.js";
import { detectMaskPolygon, fetchReducedPng } from "./mask.js";
import { sizeKm2 } from "./annotation.js";
import type { GeoMap } from "./memorix.js";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));
const maps: GeoMap[] = JSON.parse(readFileSync(`${OUT}maps.json`, "utf8"));
const sample = [0, 800, 1600, 2400, 3200, 4000, 6000, 8000, 10000, 12000, 14000, 16000]
  .map((i) => maps[i])
  .filter(Boolean);

let rotated = 0,
  rect = 0;
for (const m of sample) {
  try {
    const head = await fetchGeoJp2Head(`https://images.memorix.nl/gra/download/mediabank/${m.assetId}`);
    const b = boundsFromGeoJp2(head, m.width, m.height);
    const pix = detectMaskPolygon(await fetchReducedPng(m.assetId, 256), m.width, m.height);
    const sx = (b.lrX - b.ulX) / m.width;
    const sy = (b.ulY - b.lrY) / m.height;
    const geo = pix.map(([px, py]) => [b.ulX + px * sx, b.ulY - py * sy]);
    let a = 0;
    for (let i = 0; i < geo.length; i++) {
      const [x1, y1] = geo[i],
        [x2, y2] = geo[(i + 1) % geo.length];
      a += x1 * y2 - x2 * y1;
    }
    const xs = geo.map((g) => g[0]),
      ys = geo.map((g) => g[1]);
    const bbox = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    const fill = bbox > 0 ? Math.abs(a) / 2 / bbox : 1; // 1 = fills bbox (north-up rect); <1 = rotated
    const isRot = fill < 0.92;
    isRot ? rotated++ : rect++;
    console.log(
      `${(m.title || "").slice(0, 30).padEnd(30)} pts=${pix.length}  ${sizeKm2(geo).toFixed(2).padStart(9)} km²  fill=${fill.toFixed(2)}  ${isRot ? "ROTATED" : "rect"}`,
    );
  } catch (e) {
    console.log(m.assetId, "ERR", (e as Error).message);
  }
}
console.log(`\nrotated: ${rotated}  axis-aligned: ${rect}`);
