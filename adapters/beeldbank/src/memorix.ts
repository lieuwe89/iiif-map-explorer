// Enumerate georeferenced Maps from the Picturae/Memorix Mediabank API.
// No server-side isgeotiff filter exists, so we full-scan and filter inline
// (the search response carries asset.isgeotiff + mapdata + dimensions).

const KEY = "fd45b590-346a-11e5-a2cb-0800200c9a66";
const BASE = "https://webservices.memorix.nl/mediabank/media";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GeoMap {
  recordId: string;
  assetId: string;
  title: string;
  dateStart: number | null;
  dateEnd: number | null;
  width: number;
  height: number;
  centroid: { lat: number; lng: number } | null;
  sourceUrl: string;
}

/** "1860-1880" -> [1860,1880]; "1900" -> [1900,1900]; junk -> [null,null]. */
export function normalizeDate(raw: string | null | undefined): [number | null, number | null] {
  if (!raw) return [null, null];
  const ys = (raw.match(/\d{4}/g) || []).map(Number).filter((y) => y >= 1400 && y <= 2100);
  if (ys.length === 0) return [null, null];
  return [Math.min(...ys), Math.max(...ys)];
}

async function fetchJsonWithRetry(url: string, retries = 4): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

/** Page the corpus, keeping Records whose Asset has isgeotiff, until `limit`. */
export async function enumerateGeoreferenced(
  limit = Infinity,
  onProgress?: (seen: number, geo: number, pages: number) => void,
): Promise<GeoMap[]> {
  const out: GeoMap[] = [];
  const rows = 100;
  let page = 1;
  let seen = 0;
  while (out.length < limit) {
    const data = await fetchJsonWithRetry(`${BASE}?apiKey=${KEY}&rows=${rows}&page=${page}`);
    const media: any[] = data?.media || [];
    if (media.length === 0) break;
    for (const m of media) {
      seen++;
      const asset = (m.asset || []).find((a: any) => a.isgeotiff);
      if (!asset) continue;
      const md: Record<string, any> = Object.fromEntries(
        (m.metadata || []).filter((x: any) => x && x.field).map((x: any) => [x.field, x.value]),
      );
      const [dateStart, dateEnd] = normalizeDate(md.date);
      const center = asset.mapdata?.center;
      out.push({
        recordId: m.id,
        assetId: asset.uuid,
        title: m.title || md.title || "(untitled)",
        dateStart,
        dateEnd,
        width: asset.width,
        height: asset.height,
        centroid: center ? { lat: center.lat, lng: center.lng } : null,
        sourceUrl: `https://www.beeldbankgroningen.nl/beelden/detail/${m.id}/media/${asset.uuid}`,
      });
      if (out.length >= limit) break;
    }
    if (page % 20 === 0) onProgress?.(seen, out.length, page);
    page++;
    await sleep(110);
  }
  onProgress?.(seen, out.length, page);
  return out;
}
