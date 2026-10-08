export interface JobFaqItem {
  question: string;
  answer: string;
}

export const JOB_APPLY_FAQ_HEADING = 'Prima di scrivere o chiamare per candidarti, ricorda:';

export const JOB_APPLY_FAQ_LEAD =
  'Una candidatura mirata aumenta le possibilità di risposta e rispetta il tempo di chi seleziona il personale.';

/** FAQ utili in fondo alle pagine lavoro (box + JSON-LD). */
export const JOB_APPLY_FAQ_ITEMS: JobFaqItem[] = [
  {
    question: 'Per quanto tempo resta online un annuncio?',
    answer:
      "Ogni offerta resta visibile al massimo 60 giorni (2 mesi) dalla data di pubblicazione. Trascorso questo periodo l'annuncio viene rimosso automaticamente per mantenere il portale aggiornato.",
  },
  {
    question: "Leggi tutto l'annuncio prima di candidarti",
    answer:
      'Controlla contratto, orari, mansione, requisiti (iscrizione Albo, esperienza, disponibilità notturna/festiva) e modalità di invio CV. Evita messaggi generici copiati su più offerte.',
  },
  {
    question: 'Prepara CV e documenti pertinenti',
    answer:
      'Invia un curriculum aggiornato e, se richiesto, lettera breve personalizzata per quella farmacia. Indica chiaramente disponibilità, città di residenza e eventuali certificazioni utili al ruolo.',
  },
  {
    question: 'Se hai dubbi, chiama prima di inviare la candidatura',
    answer:
      'Una telefonata rapida può chiarire retribuzione, turni e tempi di assunzione. Evita di candidarti a offerte non in linea con la tua situazione: risparmi tempo tu e rispetti chi gestisce le selezioni.',
  },
];

/** FAQ orientate a chi cerca lavoro su una pagina città/ruolo (almeno 4 + JSON-LD). */
export function buildCityRoleJobFaq(opts: {
  cityLabel: string;
  roleLabel: string;
  jobCount: number;
  locationPhrase: string;
}): JobFaqItem[] {
  const { cityLabel, roleLabel, jobCount, locationPhrase } = opts;
  const where = cityLabel === 'Italia' ? 'in Italia' : `a ${cityLabel}`;
  const countLabel =
    jobCount === 0
      ? 'al momento non risultano annunci attivi'
      : jobCount === 1
        ? 'c’è 1 offerta attiva'
        : `ci sono ${jobCount} offerte attive`;

  return [
    {
      question: `Ci sono offerte di lavoro come ${roleLabel} ${where}?`,
      answer: `Sì: in questa pagina ${countLabel} per ${roleLabel} ${locationPhrase}. Gli annunci sono aggiornati automaticamente e restano online al massimo 60 giorni dalla pubblicazione.`,
    },
    {
      question: `Come candidarmi a un’offerta di ${roleLabel} ${where}?`,
      answer: `Apri l’annuncio che ti interessa, leggi contratto e requisiti, poi contatta la farmacia con i riferimenti indicati (telefono, email o form). Un CV aggiornato e una candidatura specifica per quella sede aumentano le possibilità di risposta.`,
    },
    {
      question: `Quanto guadagna un ${roleLabel.toLowerCase()} ${where}?`,
      answer: `La retribuzione dipende da contratto, esperienza e orario: non sempre è indicata nell’annuncio. Controlla se compare uno stipendio o una RAL nel testo; in caso contrario puoi chiedere in fase di contatto o colloquio, dopo aver verificato mansione e turni.`,
    },
    {
      question: `Posso ricevere alert quando escono nuove offerte ${where}?`,
      answer: `Sì. Dalla pagina lavoro puoi registrarti come candidato e salvare un alert sulla zona e sul ruolo: ricevi una mail solo quando vengono pubblicate nuove offerte pertinenti, senza dover ricontrollare il sito ogni giorno.`,
    },
  ];
}

export function mergeJobFaqForJsonLd(local: JobFaqItem[] = []): JobFaqItem[] {
  const seen = new Set<string>();
  const out: JobFaqItem[] = [];
  for (const item of [...local, ...JOB_APPLY_FAQ_ITEMS]) {
    const key = item.question.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export {
  NEAR_ME_EXTENDED_MAX_KM,
  NEAR_ME_EXTENDED_MAX_KM as NEAR_ME_MAX_KM,
  NEAR_ME_PREFERRED_KM,
} from '@/lib/geoTurni';
