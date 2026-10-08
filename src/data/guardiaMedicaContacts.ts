/** Contatti Continuità Assistenziale / ex Guardia Medica — fonti ufficiali verificate. */

export type GuardiaMedica116117Status = 'active' | 'partial' | 'planned' | 'unknown' | 'not_active';
export type GuardiaMedicaCoverageLevel = 'national' | 'region' | 'province' | 'asl' | 'city' | 'unknown';
export type GuardiaMedicaConfidence = 'high' | 'medium' | 'low';

export interface GuardiaMedicaContactRecord {
  region: string | null;
  province: string | null;
  city: string | null;
  service_name: string;
  primary_phone: string | null;
  secondary_phone: string | null;
  emergency_phone: string;
  status_116117: GuardiaMedica116117Status;
  coverage_level: GuardiaMedicaCoverageLevel;
  coverage_note: string;
  opening_hours_note?: string;
  official_source_name: string | null;
  official_source_url: string | null;
  last_verified: string;
  confidence: GuardiaMedicaConfidence;
}

export const GUARDIA_MEDICA_CONTACTS: GuardiaMedicaContactRecord[] = [
  {
    region: 'Liguria',
    province: 'GE',
    city: 'Rapallo',
    service_name: 'Continuità Assistenziale / ex Guardia Medica',
    primary_phone: '116117',
    secondary_phone: null,
    emergency_phone: '112 / 118',
    status_116117: 'active',
    coverage_level: 'asl',
    coverage_note:
      '116117 attivo in ASL4 / Tigullio, inclusa Rapallo. Alcuni comuni ASL4 con prefisso 0187 possono avere numero locale diverso.',
    official_source_name: 'ASL4 Liguria',
    official_source_url: 'https://www.asl4.liguria.it/guardia-medica/',
    last_verified: '2026-06-29',
    confidence: 'high',
  },
  {
    region: 'Liguria',
    province: null,
    city: null,
    service_name: 'Continuità Assistenziale / ex Guardia Medica',
    primary_phone: null,
    secondary_phone: null,
    emergency_phone: '112 / 118',
    status_116117: 'partial',
    coverage_level: 'region',
    coverage_note:
      'In Liguria il 116117 risulta attivo in alcune aree, tra cui ASL4 / Tigullio. Per altre aree verificare ASL locale.',
    official_source_name: 'Regione Liguria',
    official_source_url:
      'https://www.regione.liguria.it/homepage-giunta/giunta-regionale/comunicati-stampa-della-giunta-regionale/item/45316-numero-116117.html',
    last_verified: '2026-06-29',
    confidence: 'medium',
  },
  {
    region: 'Lombardia',
    province: null,
    city: null,
    service_name: 'Continuità Assistenziale / ex Guardia Medica',
    primary_phone: '116117',
    secondary_phone: null,
    emergency_phone: '112 / 118',
    status_116117: 'active',
    coverage_level: 'region',
    coverage_note:
      'Numero attivo per contattare Continuità Assistenziale / ex Guardia Medica e Guardia Medica Turistica in tutto il territorio regionale.',
    official_source_name: 'Regione Lombardia',
    official_source_url:
      'https://www.regione.lombardia.it/sanita/prenotazioni-e-tempi-d-attesa/numero-europeo-armonizzato-116-117',
    last_verified: '2026-06-29',
    confidence: 'high',
  },
  {
    region: 'Toscana',
    province: null,
    city: null,
    service_name: 'Continuità Assistenziale / ex Guardia Medica',
    primary_phone: '116117',
    secondary_phone: null,
    emergency_phone: '112 / 118',
    status_116117: 'active',
    coverage_level: 'region',
    coverage_note:
      'Regione Toscana indica il 116117 come numero unico per contattare la Continuità Assistenziale.',
    official_source_name: 'Regione Toscana',
    official_source_url:
      'https://www.regione.toscana.it/-/servizio-di-continuit%C3%A0-assistenziale-guardia-medica',
    last_verified: '2026-06-29',
    confidence: 'high',
  },
  {
    region: 'Veneto',
    province: null,
    city: null,
    service_name: 'Continuità Assistenziale / ex Guardia Medica',
    primary_phone: '116117',
    secondary_phone: null,
    emergency_phone: '112 / 118',
    status_116117: 'active',
    coverage_level: 'region',
    coverage_note:
      'Il 116117 risulta attivo in tutta la Regione Veneto, gratuito e disponibile 24/7.',
    official_source_name: 'Regione Veneto',
    official_source_url:
      'https://salute.regione.veneto.it/organizzazione-sssr/il-servizio-socio-sanitario-regionale/assistenza-distrettuale/nue-116117',
    last_verified: '2026-06-29',
    confidence: 'high',
  },
  {
    region: 'Lazio',
    province: 'RM',
    city: null,
    service_name: 'Continuità Assistenziale / ex Guardia Medica',
    primary_phone: '116117',
    secondary_phone: null,
    emergency_phone: '112 / 118',
    status_116117: 'partial',
    coverage_level: 'province',
    coverage_note:
      'Salute Lazio indica il 116117 nel territorio di Roma e provincia. Verificare copertura per gli altri territori del Lazio.',
    official_source_name: 'Salute Lazio',
    official_source_url:
      'https://salutelazio.it/it/servizi/116117-numero-unico-europeo-per-cure-non-urgenti',
    last_verified: '2026-06-29',
    confidence: 'medium',
  },
];

export const GUARDIA_MEDICA_NATIONAL_FALLBACK: GuardiaMedicaContactRecord = {
  region: null,
  province: null,
  city: null,
  service_name: 'Continuità Assistenziale / ex Guardia Medica',
  primary_phone: null,
  secondary_phone: null,
  emergency_phone: '112 / 118',
  status_116117: 'unknown',
  coverage_level: 'national',
  coverage_note:
    'Il 116117 è il numero europeo armonizzato per cure non urgenti; l\'attivazione può variare per Regione o territorio. Contatta la Continuità Assistenziale della tua ASL.',
  official_source_name: 'Ministero della Salute',
  official_source_url:
    'https://www.salute.gov.it/new/it/tema/nuova-assistenza-distrettuale/numero-europeo-cure-non-urgenti-116117',
  last_verified: '2026-06-29',
  confidence: 'medium',
};
