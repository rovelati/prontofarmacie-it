/** Geolocalizzazione farmacie di turno — preferenza 10 km, estensione fino a 20 km. */

/** Raggio “locale” preferito. */
export const NEAR_ME_PREFERRED_KM = 10;
/** Se entro 10 km non bastano, estendiamo al massimo fino a qui. */
export const NEAR_ME_EXTENDED_MAX_KM = 20;
/** Sotto questa soglia entro 10 km, allargiamo oltre 10 km. */
export const NEAR_ME_MIN_RESULTS = 3;
export const NEAR_ME_MAX_RESULTS = 30;

/** @deprecated Usare NEAR_ME_EXTENDED_MAX_KM */
export const NEAR_ME_MAX_KM = NEAR_ME_EXTENDED_MAX_KM;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeoPoint {
  lat: number;
  lng: number;
  slug?: string;
}

export interface GeoRankOptions {
  preferredKm?: number;
  maxKm?: number;
  minResults?: number;
  maxResults?: number;
}

export interface GeoRankResult<T extends GeoPoint> {
  ranked: (T & { km: number })[];
  /** Distanza massima tra i risultati mostrati (o maxKm se vuoto). */
  radiusKm: number;
  /** True se almeno un risultato è oltre preferredKm. */
  extended: boolean;
}

/**
 * Priorità entro 10 km. Se zero risultati, o pochi (< minResults),
 * estende oltre 10 km fino a maxKm (20) per mostrare più farmacie aperte.
 */
export function rankPointsWithExtendedSearch<T extends GeoPoint>(
  points: T[],
  userLat: number,
  userLng: number,
  options: GeoRankOptions = {},
): GeoRankResult<T> {
  const preferredKm = options.preferredKm ?? NEAR_ME_PREFERRED_KM;
  const maxKm = options.maxKm ?? NEAR_ME_EXTENDED_MAX_KM;
  const minResults = options.minResults ?? NEAR_ME_MIN_RESULTS;
  const maxResults = options.maxResults ?? NEAR_ME_MAX_RESULTS;

  const withKm = points
    .map((p) => ({ ...p, km: haversineKm(userLat, userLng, p.lat, p.lng) }))
    .filter((p) => p.km <= maxKm)
    .sort((a, b) => a.km - b.km);

  const withinPreferred = withKm.filter((p) => p.km <= preferredKm);

  let ranked: (T & { km: number })[];
  if (withinPreferred.length >= minResults) {
    ranked = withinPreferred.slice(0, maxResults);
  } else {
    ranked = withKm.slice(0, maxResults);
  }

  const extended = ranked.some((p) => p.km > preferredKm);
  const radiusKm =
    ranked.length > 0
      ? Math.ceil(Math.max(...ranked.map((r) => r.km)) * 10) / 10
      : maxKm;

  return { ranked, radiusKm, extended };
}

/** @deprecated Usare rankPointsWithExtendedSearch */
export function rankPointsWithinRadius<T extends GeoPoint>(
  points: T[],
  userLat: number,
  userLng: number,
  maxKm = NEAR_ME_EXTENDED_MAX_KM,
  maxResults = NEAR_ME_MAX_RESULTS,
): { ranked: (T & { km: number })[]; radiusKm: number } {
  const { ranked, radiusKm } = rankPointsWithExtendedSearch(points, userLat, userLng, {
    maxKm,
    maxResults,
  });
  return { ranked, radiusKm };
}

export function bboxForRadiusKm(lat: number, lng: number, maxKm: number) {
  const dLat = maxKm / 111;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLng = maxKm / (111 * Math.max(cosLat, 0.01));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}
