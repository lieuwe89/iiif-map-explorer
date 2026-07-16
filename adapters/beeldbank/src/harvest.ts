// Harvester: enumerate -> stream GeoJP2 front box -> bounds -> annotation + index.
// Run a sample:  LIMIT=50 npm run harvest -w @ime/adapter-beeldbank
// Run the lot:   LIMIT=20000 CONC=4 npm run harvest -w @ime/adapter-beeldbank
import { mkdir, writeFile, rename } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { enumerateGeoreferenced, type GeoMap } from "./memorix.js";
import { fetchGeoJp2Head, boundsFromGeoJp2, type Bounds } from "./geojp2.js";
import { buildAnnotation, footprintPolygon, sizeKm2 } from "./annotation.js";
import { detectMaskPolygon, fetchReducedPng } from "./mask.js";
import type { FootprintFeature, FootprintsIndex } from "@ime/interchange";

const LIMIT = Number(process.env.LIMIT ?? 50);
const CONC = Number(process.env.CONC ?? 4);
const OUT = fileURLToPath(new URL("../out/", import.meta.url));

/** Bounded-concurrency worker pool. */
async function pool<T>(items: T[], conc: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: conc }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        await fn(items[i], i);
      }
    }),
  );
}

// Reject degenerate georeferencing before fetching imagery: out-of-WGS84 bounds, wrong
// orientation, world/continental scale, or a centre far from the API centroid.
function validCanvas(b: Bounds, centroid: { lat: number; lng: number } | null): boolean {
  if (!(b.ulX >= -180 && b.ulX <= 180 && b.lrX >= -180 && b.lrX <= 180)) return false;
  if (!(b.ulY >= -90 && b.ulY <= 90 && b.lrY >= -90 && b.lrY <= 90)) return false;
  if (!(b.lrX > b.ulX && b.ulY > b.lrY)) return false; // proper top-left → bottom-right, non-degenerate
  const latMid = ((b.ulY + b.lrY) / 2) * (Math.PI / 180);
  const km2 = Math.abs(b.lrX - b.ulX) * 111.32 * Math.cos(latMid) * Math.abs(b.ulY - b.lrY) * 110.57;
  if (!(km2 > 0 && km2 <= 150000)) return false;
  if (centroid) {
    const cx = (b.ulX + b.lrX) / 2;
    const cy = (b.ulY + b.lrY) / 2;
    if (Math.abs(cx - centroid.lng) > 0.2 || Math.abs(cy - centroid.lat) > 0.2) return false;
  }
  return true;
}

async function main() {
  const t0 = Date.now();
  await mkdir(`${OUT}annotations`, { recursive: true });

  // Cached enumeration — re-scanning 3,093 pages on every resume is wasteful.
  let maps: GeoMap[];
  if (existsSync(`${OUT}maps.json`)) {
    maps = JSON.parse(readFileSync(`${OUT}maps.json`, "utf8"));
    console.log(`Loaded cached enumeration: ${maps.length} maps.`);
  } else {
    console.log(`Enumerating georeferenced maps (limit ${LIMIT})…`);
    maps = await enumerateGeoreferenced(LIMIT, (seen, geo, pages) =>
      console.log(`  …scanned ${seen} records / ${geo} georeferenced (page ${pages})`),
    );
    await writeFile(`${OUT}maps.json`, JSON.stringify(maps));
  }

  // Resume — seed from the existing index and skip already-harvested maps
  // (long background runs get SIGTERM'd; re-run until complete).
  const features: FootprintFeature[] = [];
  const doneIds = new Set<string>();
  if (existsSync(`${OUT}footprints.geojson`)) {
    const prev: FootprintsIndex = JSON.parse(readFileSync(`${OUT}footprints.geojson`, "utf8"));
    features.push(...prev.features);
    for (const f of prev.features) doneIds.add(f.properties.id);
    console.log(`Resuming: ${doneIds.size} already harvested.`);
  }
  console.log(`Harvesting ${maps.length - doneIds.size} of ${maps.length} (concurrency ${CONC})…`);

  let done = 0,
    annOk = 0,
    rejected = 0,
    fail = 0;
  let annErr = "";

  const writeIndex = async () => {
    const tmp = `${OUT}footprints.geojson.tmp`;
    await writeFile(tmp, JSON.stringify({ type: "FeatureCollection", features } satisfies FootprintsIndex));
    await rename(tmp, `${OUT}footprints.geojson`);
  };

  await pool(maps, CONC, async (m) => {
    if (doneIds.has(m.assetId)) return;
    try {
      // North-up affine from the GeoJP2 front box.
      const head = await fetchGeoJp2Head(`https://images.memorix.nl/gra/download/mediabank/${m.assetId}`);
      const b = boundsFromGeoJp2(head, m.width, m.height);
      if (!validCanvas(b, m.centroid)) {
        rejected++;
        return;
      }
      // The map's true (possibly rotated) outline polygon, from the IIIF alpha channel.
      const pix = detectMaskPolygon(await fetchReducedPng(m.assetId, 256), m.width, m.height);
      const sx = (b.lrX - b.ulX) / m.width;
      const sy = (b.ulY - b.lrY) / m.height;
      const geo = pix.map(([px, py]) => [b.ulX + px * sx, b.ulY - py * sy]);
      const km2 = sizeKm2(geo);
      if (!(km2 > 0 && km2 <= 150000)) {
        rejected++;
        return;
      }
      try {
        const ann = buildAnnotation(m.assetId, m.width, m.height, pix, geo);
        await writeFile(`${OUT}annotations/${m.assetId}.json`, JSON.stringify(ann));
        annOk++;
      } catch (e) {
        annErr = (e as Error).message;
      }
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: footprintPolygon(geo) },
        properties: {
          id: m.assetId,
          recordId: m.recordId,
          title: m.title,
          dateStart: m.dateStart,
          dateEnd: m.dateEnd,
          sizeKm2: Math.round(km2 * 100) / 100,
          annotationUrl: `annotations/${m.assetId}.json`,
          sourceUrl: m.sourceUrl,
        },
      });
    } catch (e) {
      fail++;
      if (fail <= 8) console.warn(`  ✗ ${m.assetId}: ${(e as Error).message}`);
    }
    if (++done % 500 === 0) {
      await writeIndex();
      console.log(`  …${done}/${maps.length} (ok ${features.length}, fail ${fail})`);
    }
  });

  await writeIndex();
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n=== DONE in ${secs}s ===`);
  console.log(`bounds extracted   : ${features.length}/${maps.length} (fail ${fail})`);
  console.log(`rejected           : ${rejected}`);
  console.log(`annotations built  : ${annOk}/${features.length}${annErr ? `  (last error: ${annErr})` : ""}`);
  console.log(`footprints.geojson : ${features.length} features`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
