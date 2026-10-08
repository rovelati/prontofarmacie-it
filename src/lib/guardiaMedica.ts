import {
  GUARDIA_MEDICA_CONTACTS,
  GUARDIA_MEDICA_NATIONAL_FALLBACK,
  type GuardiaMedicaContactRecord,
} from '@/data/guardiaMedicaContacts';
import { PROVINCES_BY_REGION } from '@/lib/locationUtils';
import { siteUrl } from '@/lib/turni';
import type { TurniFaqItem } from '@/lib/turniFaq';

export interface GuardiaMedicaLocation {
  city?: string | null;
  provinceCode?: string | null;
}

function normKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export function getRegionByProvinceCode(provinceCode?: string | null): string | null {
  if (!provinceCode) return null;
  const code = provinceCode.toUpperCase();
  for (const [region, codes] of Object.entries(PROVINCES_BY_REGION)) {
    if (codes.includes(code)) return region;
  }
  return null;
}

function matchCity(city?: string | null): GuardiaMedicaContactRecord | null {
  if (!city) return null;
  const needle = normKey(city);
  return (
    GUARDIA_MEDICA_CONTACTS.find(
      (row) => row.city && normKey(row.city) === needle,
    ) ?? null
  );
}

function matchProvince(provinceCode?: string | null): GuardiaMedicaContactRecord | null {
  if (!provinceCode) return null;
  const code = provinceCode.toUpperCase();
  return (
    GUARDIA_MEDICA_CONTACTS.find(
      (row) => row.province === code && !row.city,
    ) ?? null
  );
}

function matchRegion(region?: string | null): GuardiaMedicaContactRecord | null {
  if (!region) return null;
  const needle = normKey(region);
  return (
    GUARDIA_MEDICA_CONTACTS.find(
      (row) => row.region && normKey(row.region) === needle && !row.province && !row.city,
    ) ?? null
  );
}

export function getGuardiaMedicaContact(location: GuardiaMedicaLocation): GuardiaMedicaContactRecord {
  const region = getRegionByProvinceCode(location.provinceCode);
  return (
    matchCity(location.city) ||
    matchProvince(location.provinceCode) ||
    matchRegion(region) ||
    GUARDIA_MEDICA_NATIONAL_FALLBACK
  );
}

export function normalizePhoneForTel(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

export function guardiaMedicaPageUrl(env: ImportMetaEnv): string {
  return `${siteUrl(env)}/farmacie-di-turno/ricetta-e-continuita-assistenziale/`;
}

export function buildGuardiaMedicaPageTitle(cityLabel?: string | null): string {
  if (cityLabel?.trim()) {
    return `Ricetta e Continuità Assistenziale a ${cityLabel} | ProntoFarmacie`;
  }
  return 'Ricetta e Continuità Assistenziale (ex Guardia Medica) | ProntoFarmacie';
}

export function buildGuardiaMedicaPageDescription(cityLabel?: string | null): string {
  if (cityLabel?.trim()) {
    return `Serve una ricetta a ${cityLabel}? Guida su Continuità Assistenziale, 116117, numeri ASL e cosa fare in farmacia di turno fuori orario.`;
  }
  return 'Guida su ricetta medica, Continuità Assistenziale ex Guardia Medica, 116117 e cosa fare se la farmacia di turno richiede prescrizione.';
}

export interface GuardiaMedicaTeaserContent {
  /** Testo prima del numero (vuoto se niente telefono da evidenziare). */
  summaryBefore: string;
  phoneDisplay: string | null;
  callHref: string | null;
  summaryAfter: string;
  /** Fallback testo intero se non c’è telefono cliccabile. */
  summary: string;
  linkLabel: string;
}

export function buildGuardiaMedicaTeaser(location: GuardiaMedicaLocation): GuardiaMedicaTeaserContent {
  const city = location.city?.trim();
  const contact = getGuardiaMedicaContact(location);
  const phone = contact.primary_phone?.trim() || null;
  const callHref = phone ? `tel:${normalizePhoneForTel(phone)}` : null;

  let summaryBefore = '';
  let summaryAfter = '';
  let summary =
    'Se il farmaco richiede prescrizione e il medico non è disponibile, consulta la guida su Continuità Assistenziale e numeri utili.';

  if (city && phone === '116117') {
    summaryBefore = `A ${city} puoi contattare il `;
    summaryAfter = ' per assistenza non urgente. Dettagli, FAQ e riferimenti ufficiali nella guida dedicata.';
    summary = `${summaryBefore}${phone}${summaryAfter}`;
  } else if (city && phone) {
    summaryBefore = `A ${city} puoi contattare il `;
    summaryAfter =
      ' per la Continuità Assistenziale. Dettagli, FAQ e riferimenti ufficiali nella guida dedicata.';
    summary = `${summaryBefore}${phone}${summaryAfter}`;
  } else if (phone === '116117') {
    summaryBefore = 'Puoi contattare il ';
    summaryAfter =
      ' per assistenza non urgente. Dettagli, FAQ e riferimenti ufficiali nella guida dedicata.';
    summary = `${summaryBefore}${phone}${summaryAfter}`;
  }

  const linkLabel = city
    ? `Ricetta e Continuità Assistenziale a ${city}`
    : 'Ricetta e Continuità Assistenziale fuori orario';

  return {
    summaryBefore,
    phoneDisplay: phone && (summaryBefore || summaryAfter) ? phone : null,
    callHref: phone && (summaryBefore || summaryAfter) ? callHref : null,
    summaryAfter,
    summary,
    linkLabel,
  };
}

export interface GuardiaMedicaBoxContent {
  contact: GuardiaMedicaContactRecord;
  locationSentence: string;
  callLabel: string | null;
  callHref: string | null;
  show116117Active: boolean;
}

export function buildGuardiaMedicaBoxContent(
  location: GuardiaMedicaLocation,
  contact = getGuardiaMedicaContact(location),
): GuardiaMedicaBoxContent {
  const city = location.city?.trim();
  const region = getRegionByProvinceCode(location.provinceCode);
  const phone = contact.primary_phone || contact.secondary_phone;
  const status = contact.status_116117;
  const show116117Active =
    contact.primary_phone === '116117' &&
    (status === 'active' || status === 'partial');

  let locationSentence: string;

  if (show116117Active && city) {
    locationSentence = `A ${city}${contact.coverage_note.includes('ASL') ? ` e nel territorio indicato` : ''} il numero di riferimento per richieste sanitarie non urgenti è il **116117**, Continuità Assistenziale / ex Guardia Medica.`;
  } else if (show116117Active && region) {
    locationSentence = `Nel territorio ${region ? `della ${region}` : 'indicato'}, per richieste sanitarie non urgenti puoi chiamare il **116117**, Continuità Assistenziale / ex Guardia Medica.`;
  } else if (phone && city) {
    locationSentence = `Nel territorio di ${city}, per contattare la Continuità Assistenziale / ex Guardia Medica puoi chiamare **${phone}**.`;
  } else if (phone && region) {
    locationSentence = `Nel territorio della ${region}, per contattare la Continuità Assistenziale / ex Guardia Medica puoi chiamare **${phone}**.`;
  } else {
    locationSentence =
      'Per assistenza sanitaria non urgente fuori dagli orari del medico di base, contatta la Continuità Assistenziale / ex Guardia Medica della tua ASL. Dove attivo, il numero di riferimento è il **116117**.';
  }

  return {
    contact,
    locationSentence,
    callLabel: phone ? `Chiama ${phone}` : null,
    callHref: phone ? `tel:${normalizePhoneForTel(phone)}` : null,
    show116117Active,
  };
}

function dynamicContactSentence(
  location: GuardiaMedicaLocation,
  contact: GuardiaMedicaContactRecord,
): string {
  const city = location.city?.trim();
  const region = getRegionByProvinceCode(location.provinceCode);
  const phone = contact.primary_phone;

  if (phone === '116117' && city) {
    return `A ${city} il numero di riferimento è 116117, dove il servizio risulta attivo.`;
  }
  if (phone === '116117' && region) {
    return `Nel territorio della ${region} il numero di riferimento è 116117, dove il servizio risulta attivo.`;
  }
  if (phone) {
    return `Per questo territorio il riferimento disponibile è ${phone}.`;
  }
  return 'Verifica sempre il numero aggiornato sul sito ufficiale della tua ASL o Regione.';
}

export function buildGuardiaMedicaFaqItems(location: GuardiaMedicaLocation): TurniFaqItem[] {
  const contact = getGuardiaMedicaContact(location);
  const city = location.city?.trim();
  const region = getRegionByProvinceCode(location.provinceCode);
  const placeLabel = city || (region ? `la ${region}` : 'questo territorio');
  const dynamic = dynamicContactSentence(location, contact);

  return [
    {
      question: 'Cosa devo fare se la farmacia di turno è aperta ma il farmaco richiede ricetta?',
      answer:
        `Se il farmaco richiede prescrizione medica, la farmacia può dispensarlo solo con una ricetta valida, salvo casi particolari valutati dal farmacista. Se il tuo medico non è disponibile, puoi contattare la Continuità Assistenziale, ex Guardia Medica. ${dynamic}`,
    },
    {
      question: 'La Guardia Medica può fare una ricetta?',
      answer:
        'La Continuità Assistenziale, ex Guardia Medica, può fornire assistenza sanitaria non urgente negli orari in cui il medico di base non è disponibile. In base alla valutazione del medico, può dare indicazioni, invitare a una visita o procedere secondo le modalità previste dal servizio sanitario locale.',
    },
    {
      question: 'Quando devo chiamare il 116117?',
      answer:
        'Il 116117 è il numero per richieste sanitarie non urgenti e per l\'accesso alla Continuità Assistenziale dove il servizio è attivo. Non va usato per emergenze. In caso di urgenza o pericolo immediato chiama 112 o 118.',
    },
    {
      question: 'Il 116117 è attivo in tutta Italia?',
      answer:
        `Il 116117 è il numero europeo armonizzato per le cure mediche non urgenti, ma la sua attivazione può variare per Regione o territorio. Su questa pagina mostriamo il riferimento disponibile per ${placeLabel}, verificato su fonti ufficiali quando disponibili.`,
    },
    {
      question: 'Posso comprare un antibiotico in farmacia di turno senza ricetta?',
      answer:
        'No, se il farmaco è soggetto a prescrizione medica, inclusi molti antibiotici, serve una ricetta valida. In caso di necessità fuori orario puoi contattare la Continuità Assistenziale / ex Guardia Medica.',
    },
  ];
}
