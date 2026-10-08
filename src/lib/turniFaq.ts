import type { TurniQueryMode } from '@/lib/turniQueryMode';
import {
  extractDomain,
  latestSourceUpdatedAt,
  type TurniSourceInfo,
} from '@/lib/turniSources';

export interface TurniFaqItem {
  question: string;
  answer: string;
}

export const TURNI_REMINDER_FAQ_HEADING = 'Prima di recarsi presso la Farmacia di Turno ricorda:';

export const TURNI_REMINDER_FAQ_LEAD =
  'Consigli pratici per evitare sorprese su costi, ricette e disponibilità del farmaco.';

/** FAQ utili mostrate in fondo alle pagine turni (box + JSON-LD). */
export const TURNI_REMINDER_FAQ_ITEMS: TurniFaqItem[] = [
  {
    question: 'La farmacia di turno può applicare il sovrapprezzo?',
    answer:
      'Sì. In orario notturno, festivo o in turno le farmacie possono applicare il sovrapprezzo previsto dalla normativa. Il costo del farmaco può quindi essere più alto rispetto all\'orario diurno.',
  },
  {
    question: 'Devo portare la ricetta per farmaci con prescrizione (es. antibiotici)?',
    answer:
      'Sì. Per farmaci soggetti a prescrizione medica (antibiotici, farmaci con ricetta ripetibile o non ripetibile) serve la ricetta valida. Senza ricetta il farmacista non può dispensare il medicinale.',
  },
  {
    question: 'Se sono in urgenza, conviene chiamare prima?',
    answer:
      'Sì, sempre. I turni possono cambiare e non tutte le farmacie hanno in pronta consegna ogni farmaco. Una telefonata prima di partire ti evita di sprecare tempo e conferma orario, disponibilità e servizi.',
  },
];

/** Unisce FAQ locali (SEO pagina) con i promemoria standard per FAQPage JSON-LD. */
export function mergeTurniFaqForJsonLd(local: TurniFaqItem[] = []): TurniFaqItem[] {
  return [...local, ...TURNI_REMINDER_FAQ_ITEMS];
}

export interface CityTurniFaqInput {
  cityLabel: string;
  provinceLabel: string;
  queryMode: TurniQueryMode;
  openCount: number;
  totalListed: number;
  cityPharmacyCount: number;
  officialShiftOpenCount: number;
  sources: TurniSourceInfo[];
  sourcesUpdatedAt?: Date | null;
  nearbySearch?: { extended?: boolean } | null;
}

export interface ProvinceTurniFaqInput {
  provinceLabel: string;
  queryMode: TurniQueryMode;
  openCount: number;
  totalListed: number;
  officialShiftOpenCount: number;
  sources: TurniSourceInfo[];
  sourcesUpdatedAt?: Date | null;
}

function formatItalianDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeSourceClause(source: TurniSourceInfo): string {
  const domain = extractDomain(source.sourceUrl);

  if (source.slug === 'federfarma-lombardia') {
    return `l'elenco ufficiale Federfarma Lombardia (${domain}), di riferimento per i turni in regione`;
  }
  if (source.slug.startsWith('aulss')) {
    return `i turni pubblicati dalla ${source.name} (${domain}), portale del Servizio Sanitario Regionale del Veneto`;
  }
  if (source.slug.startsWith('ordine-farmacisti')) {
    return `i calendari pubblicati dall'${source.name} (${domain})`;
  }
  if (source.slug.startsWith('pharmaround-turni-') || source.slug === 'pharmaround') {
    return `i calendari dell'Ordine dei Farmacisti locale e i portali dedicati ai turni farmaceutici`;
  }
  return `${source.name} (${domain})`;
}

function joinItalianList(clauses: string[]): string {
  if (clauses.length === 0) return '';
  if (clauses.length === 1) return clauses[0];
  if (clauses.length === 2) return `${clauses[0]} e ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')} e ${clauses[clauses.length - 1]}`;
}

function buildSourcesAnswer(
  sources: TurniSourceInfo[],
  provinceLabel: string,
  queryMode: TurniQueryMode,
): string {
  if (queryMode === 'ordinary') {
    const shiftHint =
      sources.length > 0
        ? ` Fuori da questa fascia (sera, notte, domenica e festivi) la stessa pagina utilizza ${joinItalianList(sources.map(describeSourceClause))}.`
        : ' Fuori da questa fascia consulta la pagina provinciale o il sito dell\'Ordine dei Farmacisti per i turni ufficiali.';
    return (
      `In orario ordinario (lun–ven 8:00–19:30) mostriamo le farmacie del comune con gli orari di apertura ricavati dalle schede farmacia (censimento e arricchimenti da fonti pubbliche). Non è l'elenco di turno festivo o notturno.${shiftHint}`
    );
  }

  if (!sources.length) {
    return (
      `Per la provincia di ${provinceLabel} non abbiamo ancora una fonte automatica certificata dei turni. Gli orari possono derivare dalle schede farmacia o da aggiornamenti parziali: verifica sempre telefonicamente e consulta il sito dell'Ordine dei Farmacisti o l'ente sanitario competente.`
    );
  }

  const clauses = sources.map(describeSourceClause);
  return (
    `Per la provincia di ${provinceLabel} sincronizziamo ${joinItalianList(clauses)}. I turni vengono acquisiti automaticamente, abbinati alle farmacie censite e aggiornati quando la fonte istituzionale pubblica nuovi calendari.`
  );
}

function buildUpdatedAtAnswer(
  sources: TurniSourceInfo[],
  sourcesUpdatedAt: Date | null | undefined,
  queryMode: TurniQueryMode,
): string {
  const formatted = formatItalianDateTime(sourcesUpdatedAt ?? latestSourceUpdatedAt(sources));
  if (formatted && sources.length) {
    const primary = sources[0];
    const primarySlug = primary?.slug || '';
    const isGenericPortal =
      primarySlug.startsWith('pharmaround-turni-') || primarySlug === 'pharmaround';
    const primaryLabel = isGenericPortal
      ? "l'Ordine dei Farmacisti e i portali dedicati"
      : (primary?.name ?? 'fonte ufficiale');
    return (
      `L'ultimo aggiornamento registrato per ${primaryLabel} risale al ${formatted} (ora italiana). I turni possono variare per comunicazioni dell'Ordine o dell'ASL: una telefonata prima di partire resta la verifica più affidabile.`
    );
  }
  if (queryMode === 'ordinary') {
    return (
      'Gli orari ordinari seguono le schede farmacia e possono non riflettere variazioni dell\'ultima ora. Per turni notturni e festivi controlla di nuovo la pagina fuori dall\'orario diurno o consulta la fonte ufficiale provinciale.'
    );
  }
  return (
    'I dati vengono aggiornati periodicamente dalle fonti istituzionali. Se hai dubbi su apertura o turno, chiama la farmacia o consulta il portale dell\'Ordine dei Farmacisti o dell\'ASL della tua provincia.'
  );
}

function buildOpenNowAnswer(input: CityTurniFaqInput): string {
  const {
    cityLabel,
    queryMode,
    openCount,
    totalListed,
    cityPharmacyCount,
    officialShiftOpenCount,
    nearbySearch,
  } = input;

  const ordinaryOpenCount = Math.max(0, openCount - officialShiftOpenCount);

  if (queryMode === 'ordinary') {
    if (openCount > 0) {
      return `In orario ordinario risultano ${openCount} farmacie aperte ora su ${totalListed} nel comune di ${cityLabel}. Verifica sempre telefonicamente prima di recarti in sede.`;
    }
    return `Al momento non risultano farmacie aperte con orario ordinario a ${cityLabel}.`;
  }

  if (openCount > 0 && nearbySearch) {
    const radius = nearbySearch.extended ? '10–20 km' : '10 km';
    return `Nel comune di ${cityLabel} nessuna farmacia risulta in turno adesso; abbiamo cercato entro ${radius} e trovato ${openCount} farmacie aperte ora. Controlla distanza e orario prima di partire.`;
  }

  if (openCount > 0) {
    let answer = `Risultano ${openCount} farmacie aperte ora a ${cityLabel}.`;
    if (officialShiftOpenCount > 0 && ordinaryOpenCount > 0) {
      answer += ` Di queste, ${officialShiftOpenCount} risultano in turno ufficiale e ${ordinaryOpenCount} con orario ordinario da scheda farmacia (non turno ASL/Ordine).`;
    } else if (officialShiftOpenCount > 0) {
      answer += ' Gli orari provengono dai calendari ufficiali di turno.';
    } else if (ordinaryOpenCount > 0) {
      answer += ' Nessuna risulta in turno ufficiale in questo momento: gli orari indicati derivano dalle schede farmacia. Per un farmaco fuori orario consulta la fonte istituzionale provinciale.';
    }
    answer += ' I dati possono cambiare: verifica sempre telefonicamente.';
    return answer;
  }

  if (cityPharmacyCount > 0) {
    return `Nel comune di ${cityLabel} risultano ${cityPharmacyCount} farmacie censite, ma al momento nessuna risulta aperta in turno. Consulta la pagina provinciale, la fonte ufficiale ASL/Ordine o chiama prima di spostarti.`;
  }

  return 'Se non risultano farmacie aperte ora, consulta la pagina provinciale o verifica telefonicamente con l\'Ordine dei Farmacisti.';
}

export function buildCityTurniFaqItems(input: CityTurniFaqInput): TurniFaqItem[] {
  const {
    cityLabel,
    provinceLabel,
    queryMode,
    sources,
    sourcesUpdatedAt,
  } = input;

  const findQuestion =
    queryMode === 'ordinary'
      ? `Come trovo una farmacia aperta a ${cityLabel} oggi?`
      : `Come trovo una farmacia di turno a ${cityLabel} oggi?`;

  const findAnswer =
    queryMode === 'ordinary'
      ? `Consulta mappa ed elenco in questa pagina: mostriamo le farmacie del comune con orario ordinario aggiornato. Per turni notturni, domenicali o festivi torna qui fuori fascia 8:00–19:30 o apri la pagina provinciale di ${provinceLabel}.`
      : `Usa la mappa e l'elenco di questa pagina per ${cityLabel}, verifica telefono e orario, poi chiama prima di partire. Per l'intera provincia puoi passare alla pagina «Farmacie di turno in provincia di ${provinceLabel}».`;

  return [
    { question: findQuestion, answer: findAnswer },
    {
      question: `Le farmacie indicate a ${cityLabel} sono aperte ora?`,
      answer: buildOpenNowAnswer(input),
    },
    {
      question:
        queryMode === 'ordinary'
          ? `Da dove arrivano gli orari delle farmacie a ${cityLabel}?`
          : `Da dove arrivano i turni delle farmacie a ${cityLabel}?`,
      answer: buildSourcesAnswer(sources, provinceLabel, queryMode),
    },
    {
      question: `Quando sono stati aggiornati i dati per ${cityLabel}?`,
      answer: buildUpdatedAtAnswer(sources, sourcesUpdatedAt, queryMode),
    },
  ];
}

export function buildProvinceTurniFaqItems(input: ProvinceTurniFaqInput): TurniFaqItem[] {
  const {
    provinceLabel,
    queryMode,
    openCount,
    officialShiftOpenCount,
    sources,
    sourcesUpdatedAt,
  } = input;

  const ordinaryOpenCount = Math.max(0, openCount - officialShiftOpenCount);

  let openAnswer: string;
  if (queryMode === 'ordinary') {
    openAnswer = openCount
      ? `In orario ordinario risultano ${openCount} farmacie aperte ora in provincia di ${provinceLabel}. Verifica telefonicamente orario e servizi.`
      : `Al momento non risultano farmacie aperte con orario ordinario in provincia di ${provinceLabel}.`;
  } else if (openCount) {
    openAnswer = `Risultano ${openCount} farmacie aperte ora in provincia di ${provinceLabel}.`;
    if (officialShiftOpenCount > 0 && ordinaryOpenCount > 0) {
      openAnswer += ` ${officialShiftOpenCount} in turno ufficiale, ${ordinaryOpenCount} con orario da scheda farmacia.`;
    } else if (ordinaryOpenCount > 0 && officialShiftOpenCount === 0) {
      openAnswer += ' Nessuna risulta in turno ufficiale al momento: controlla la fonte ASL/Ordine se cerchi un turno notturno o festivo.';
    }
    openAnswer += ' I dati possono cambiare durante la giornata: verifica sempre telefonicamente.';
  } else {
    openAnswer =
      'Se non risultano farmacie aperte ora, consulta comunque la fonte ufficiale provinciale (Ordine dei Farmacisti o ASL) o chiama prima di spostarti.';
  }

  return [
    {
      question:
        queryMode === 'ordinary'
          ? `Come trovo una farmacia aperta in provincia di ${provinceLabel} oggi?`
          : `Come trovo una farmacia di turno in provincia di ${provinceLabel} oggi?`,
      answer:
        queryMode === 'ordinary'
          ? `Usa mappa ed elenco provinciale: in fascia 8:00–19:30 mostriamo le farmacie con orario ordinario. Per turni serali, notturni e festivi consulta la stessa pagina fuori orario o le città collegate.`
          : `Usa la mappa e l'elenco in questa pagina per orientarti per zona, poi chiama la farmacia scelta per confermare turno, orario e disponibilità del farmaco.`,
    },
    {
      question: `Le farmacie indicate in provincia di ${provinceLabel} sono aperte ora?`,
      answer: openAnswer,
    },
    {
      question:
        queryMode === 'ordinary'
          ? `Da dove arrivano gli orari in provincia di ${provinceLabel}?`
          : `Da dove arrivano i turni in provincia di ${provinceLabel}?`,
      answer: buildSourcesAnswer(sources, provinceLabel, queryMode),
    },
    {
      question: `Quando sono stati aggiornati i dati in provincia di ${provinceLabel}?`,
      answer: buildUpdatedAtAnswer(sources, sourcesUpdatedAt, queryMode),
    },
  ];
}
