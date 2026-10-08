import { fetchJobListings, jobListingPath, type JobListing } from '@/lib/jobs';
import { slugifySegment } from '@/lib/turni';

export interface AdjacentJobZone {
  slug: string;
  label: string;
}

export interface AdjacentJobZonesConfig {
  /** Nota sul perché mostriamo zone italiane. */
  countryNote: string;
  zones: AdjacentJobZone[];
}

/**
 * Città fuori Italia (o di confine) con zone limitrofe italiane dove cercare lavoro.
 * Chiave = city slug URL.
 */
const ADJACENT_JOB_ZONES: Record<string, AdjacentJobZonesConfig> = {
  lugano: {
    countryNote:
      'Lugano è in Svizzera (Canton Ticino). Su ProntoFarmacie pubblichiamo offerte in Italia: ecco le zone limitrofe più vicine al confine.',
    zones: [
      { slug: 'como', label: 'Como' },
      { slug: 'varese', label: 'Varese' },
      { slug: 'luino', label: 'Luino' },
      { slug: 'gallarate', label: 'Gallarate' },
      { slug: 'appiano-gentile', label: 'Appiano Gentile' },
    ],
  },
  chiasso: {
    countryNote:
      'Chiasso è in Svizzera (Canton Ticino). Ecco le offerte nelle zone italiane più vicine al confine.',
    zones: [
      { slug: 'como', label: 'Como' },
      { slug: 'appiano-gentile', label: 'Appiano Gentile' },
      { slug: 'varese', label: 'Varese' },
    ],
  },
  mendrisio: {
    countryNote:
      'Mendrisio è in Svizzera (Canton Ticino). Ecco le offerte nelle zone italiane più vicine al confine.',
    zones: [
      { slug: 'como', label: 'Como' },
      { slug: 'appiano-gentile', label: 'Appiano Gentile' },
      { slug: 'varese', label: 'Varese' },
    ],
  },
  bellinzona: {
    countryNote:
      'Bellinzona è in Svizzera (Canton Ticino). Ecco le offerte nelle zone italiane più vicine.',
    zones: [
      { slug: 'luino', label: 'Luino' },
      { slug: 'varese', label: 'Varese' },
      { slug: 'como', label: 'Como' },
    ],
  },
  locarno: {
    countryNote:
      'Locarno è in Svizzera (Canton Ticino). Ecco le offerte nelle zone italiane più vicine.',
    zones: [
      { slug: 'luino', label: 'Luino' },
      { slug: 'varese', label: 'Varese' },
      { slug: 'como', label: 'Como' },
    ],
  },
};

export function getAdjacentJobZones(citySlug: string): AdjacentJobZonesConfig | null {
  const key = slugifySegment(citySlug || '');
  return ADJACENT_JOB_ZONES[key] || null;
}

export type AdjacentZoneJobs = AdjacentJobZone & {
  href: string;
  jobs: JobListing[];
  count: number;
};

/** Carica offerte per le zone limitrofe (stesso ruolo), ordinate per densità annunci. */
export async function fetchAdjacentZoneJobs(
  citySlug: string,
  roleSlug: string,
  perZoneLimit = 4,
): Promise<{ config: AdjacentJobZonesConfig; zones: AdjacentZoneJobs[] } | null> {
  const config = getAdjacentJobZones(citySlug);
  if (!config) return null;

  const role = roleSlug || 'tutte';
  const results = await Promise.all(
    config.zones.map(async (zone) => {
      const jobs = await fetchJobListings(zone.slug, role);
      return {
        ...zone,
        href: jobListingPath(zone.slug, role, jobs.length),
        jobs: jobs.slice(0, perZoneLimit),
        count: jobs.length,
      };
    }),
  );

  const zones = results
    .filter((z) => z.count > 0)
    .sort((a, b) => b.count - a.count);

  return { config, zones };
}
