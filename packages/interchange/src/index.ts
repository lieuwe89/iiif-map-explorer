// The contract between a Source Adapter (producer) and the Explorer (consumer).
// See ../../../CONTEXT-MAP.md — "Shared interchange".

/** Minimal per-Map metadata carried in the bulk Footprints Index. */
export interface FootprintProperties {
  /** Stable id for the Map (the Beeldbank Asset-UUID). */
  id: string;
  /** Source Record id (for linking/debug). */
  recordId: string;
  title: string;
  /** Normalised date range; null when unknown. */
  dateStart: number | null;
  dateEnd: number | null;
  /** Map Size — Footprint ground area in km². */
  sizeKm2: number;
  /** URL of this Map's Georeference Annotation (for lazy draping). */
  annotationUrl: string;
  /** Link back to the Source's detail page. */
  sourceUrl: string;
}

export interface FootprintFeature {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: FootprintProperties;
}

/** The bulk artifact: every Map's Footprint + minimal metadata. */
export interface FootprintsIndex {
  type: "FeatureCollection";
  features: FootprintFeature[];
}
