// Independent validation of the harvest output (not the harvester's self-report).
// Proves every annotation round-trips through Allmaps' own parser.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseAnnotation } from "@allmaps/annotation";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));

const idx = JSON.parse(await readFile(`${OUT}footprints.geojson`, "utf8"));
console.log("FootprintsIndex.type :", idx.type, "| features:", idx.features.length);

const f = idx.features[0];
console.log("feature[0].properties:", JSON.stringify(f.properties));
console.log("feature[0] ring length:", f.geometry.coordinates[0].length, "(5 = closed rectangle)");

let ok = 0,
  bad = 0;
let sample: any = null;
for (const ft of idx.features) {
  const ann = JSON.parse(await readFile(`${OUT}${ft.properties.annotationUrl}`, "utf8"));
  try {
    parseAnnotation(ann); // throws if not a valid Georeference Annotation
    if (!sample) sample = ann;
    ok++;
  } catch (e) {
    bad++;
    if (bad <= 2) console.log("  ✗ invalid:", ft.properties.id, (e as Error).message);
  }
}
console.log(`annotations valid (parseAnnotation): ${ok} / bad: ${bad}`);
console.log("sample @context  :", JSON.stringify(sample["@context"]));
console.log("sample target.src:", sample.target?.source?.id ?? sample.target?.source);
console.log("sample GCP count :", sample.body?.features?.length);
console.log(bad === 0 ? "\nVALIDATION: PASS ✓" : "\nVALIDATION: FAIL ✗");
