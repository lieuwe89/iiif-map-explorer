// Extract georeferencing from a Beeldbank GeoJP2 by reading only the front box.
// Validated against GDAL ground truth (see ADR-0003). No GDAL dependency.

const GEOJP2_UUID = Buffer.from("b14bf8bd083d4b43a5ae8cd7d5a6ce03", "hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Bounds {
  ulX: number;
  ulY: number;
  lrX: number;
  lrY: number;
  epsg: number | null;
}

/** Locate the GeoJP2 UUID box and return its embedded mini-GeoTIFF bytes. */
export function extractGeoTiff(buf: Buffer): Buffer {
  let idx = 0;
  for (;;) {
    const u = buf.indexOf("uuid", idx, "ascii");
    if (u < 0) throw new Error("GeoJP2 uuid box not found in head");
    if (u >= 4 && buf.subarray(u + 4, u + 20).equals(GEOJP2_UUID)) {
      const boxStart = u - 4;
      const lbox = buf.readUInt32BE(boxStart);
      return buf.subarray(u + 20, boxStart + lbox);
    }
    idx = u + 4;
  }
}

function parseGeoTiff(tiff: Buffer) {
  const le = tiff[0] === 0x49; // 'II' little-endian, 'MM' big-endian
  const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => dv.getUint16(o, le);
  const u32 = (o: number) => dv.getUint32(o, le);
  const f64 = (o: number) => dv.getFloat64(o, le);
  if (u16(2) !== 42) throw new Error("bad TIFF magic");
  const ifd = u32(4);
  const n = u16(ifd);
  const tags: Record<number, { count: number; valOff: number }> = {};
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    tags[u16(e)] = { count: u32(e + 4), valOff: e + 8 };
  }
  const doubles = (tag: number): number[] | null => {
    const t = tags[tag];
    if (!t) return null;
    const base = u32(t.valOff); // count*8 > 4 => the field is an offset
    return Array.from({ length: t.count }, (_, k) => f64(base + k * 8));
  };
  const scale = doubles(33550); // ModelPixelScale [sx, sy, sz]
  const tie = doubles(33922); // ModelTiepoint [i, j, k, X, Y, Z]
  if (!scale || !tie) throw new Error("missing ModelPixelScale/ModelTiepoint");
  let epsg: number | null = null;
  const gk = tags[34735]; // GeoKeyDirectory
  if (gk) {
    const base = gk.count * 2 > 4 ? u32(gk.valOff) : gk.valOff;
    const numKeys = u16(base + 6);
    for (let k = 0; k < numKeys; k++) {
      const ko = base + 8 + k * 8;
      const keyId = u16(ko);
      const tagLoc = u16(ko + 2);
      const value = u16(ko + 6);
      if ((keyId === 2048 || keyId === 3072) && tagLoc === 0) epsg = value;
    }
  }
  return { scale, tie, epsg };
}

export function boundsFromGeoJp2(buf: Buffer, width: number, height: number): Bounds {
  const { scale, tie, epsg } = parseGeoTiff(extractGeoTiff(buf));
  const [sx, sy] = scale;
  const [i, j, , X, Y] = tie;
  const ulX = X - i * sx;
  const ulY = Y + j * sy;
  return { ulX, ulY, lrX: ulX + width * sx, lrY: ulY - height * sy, epsg };
}

/** Stream the download URL, read only the first maxBytes, then abort. Retries on 429/5xx/network. */
export async function fetchGeoJp2Head(url: string, maxBytes = 16384, retries = 4): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const ctrl = new AbortController();
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      ctrl.abort();
      return Buffer.concat(chunks);
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(1000 * 2 ** attempt); // 1s, 2s, 4s, 8s
    }
  }
}
