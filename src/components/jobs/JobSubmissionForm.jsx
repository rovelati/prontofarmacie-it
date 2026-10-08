import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, Lock, ShieldCheck } from 'lucide-react';

const INITIAL_FORM_STATE = {
  pharmacyName: '',
  pharmacyAddress: '',
  pharmacyCity: '',
  pharmacyProvince: '',
  pharmacyZip: '',
  pharmacyEmail: '',
  pharmacyPhone: '',
  pharmacyWebsite: '',
  pharmacyMapsUrl: '',
  jobTitle: '',
  jobCategory: '',
  contractType: '',
  workingHours: '',
  salaryRange: '',
  description: '',
  requirements: '',
  benefits: '',
  notes: '',
  contactEmail: '',
  contactPhone: '',
  submitterName: '',
  submitterEmail: '',
  consentPrivacy: false,
  consentResponsibility: false,
};

const sanitizeMultiline = (value) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

const JobSubmissionPage = () => {
  const { toast } = useToast();
  const [formState, setFormState] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientIp, setClientIp] = useState('');
  const [ipError, setIpError] = useState('');
  const [isIpLoading, setIsIpLoading] = useState(true);
  const [linkedUser, setLinkedUser] = useState(null);
  const [claimedPharmacyId, setClaimedPharmacyId] = useState(null);
  const [prefillNote, setPrefillNote] = useState('');

  const categories = useMemo(
    () => [
      { value: '', label: 'Seleziona una categoria' },
      { value: 'Farmacista', label: 'Farmacista' },
      { value: 'Magazzino', label: 'Magazziniere' },
      { value: 'Direzione', label: 'Direzione' },
      { value: 'Vendite', label: 'Vendite' },
      { value: 'Altro', label: 'Altro' },
    ],
    []
  );

  const contractOptions = useMemo(
    () => [
      { value: '', label: 'Seleziona tipologia di contratto' },
      { value: 'Full time', label: 'Full time' },
      { value: 'Part time', label: 'Part time' },
      { value: 'Tempo determinato', label: 'Tempo determinato' },
      { value: 'Tempo indeterminato', label: 'Tempo indeterminato' },
      { value: 'Stage/Tirocinio', label: 'Stage / Tirocinio' },
      { value: 'Collaborazione', label: 'Collaborazione' },
    ],
    []
  );

  useEffect(() => {
    let isMounted = true;
    const fetchIp = async () => {
      setIsIpLoading(true);
      setIpError('');
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (!response.ok) {
          throw new Error('Impossibile recuperare il tuo IP');
        }
        const { ip } = await response.json();
        if (isMounted) {
          setClientIp(ip);
        }
      } catch (error) {
        console.error('IP lookup failed:', error);
        if (isMounted) {
          setIpError('Errore nel recupero dell’indirizzo IP. Riprova più tardi.');
        }
      } finally {
        if (isMounted) {
          setIsIpLoading(false);
        }
      }
    };

    fetchIp();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const prefillFromAccount = async () => {
      try {
        const sessionRes = await fetch('/api/local-auth?action=session', { credentials: 'same-origin' });
        const sessionPayload = await sessionRes.json().catch(() => ({}));
        const user = sessionPayload.user;
        if (!user || (user.role !== 'pharmacy_owner' && user.role !== 'admin')) return;

        const dashRes = await fetch('/api/marketplace/pharmacy?action=dashboard', {
          credentials: 'same-origin',
        });
        const dash = await dashRes.json().catch(() => ({}));
        if (!isMounted) return;

        setLinkedUser(user);
        const pharmacy = dash.pharmacy;
        if (pharmacy) {
          setClaimedPharmacyId(pharmacy.id || dash.claim?.pharmacy_id || null);
          setFormState((prev) => ({
            ...prev,
            pharmacyName: pharmacy.name || prev.pharmacyName,
            pharmacyAddress: pharmacy.address || prev.pharmacyAddress,
            pharmacyCity: pharmacy.city || prev.pharmacyCity,
            pharmacyProvince: (pharmacy.province || prev.pharmacyProvince || '').toString().slice(0, 2).toUpperCase(),
            pharmacyEmail: pharmacy.email || prev.pharmacyEmail,
            pharmacyPhone: pharmacy.phone || prev.pharmacyPhone,
            pharmacyWebsite: pharmacy.website || prev.pharmacyWebsite,
            contactEmail: pharmacy.email || user.email || prev.contactEmail,
            submitterEmail: user.email || prev.submitterEmail,
            submitterName: user.display_name || prev.submitterName,
          }));
          setPrefillNote(`Compilato automaticamente dalla scheda collegata: ${pharmacy.name}`);
        } else {
          setFormState((prev) => ({
            ...prev,
            contactEmail: user.email || prev.contactEmail,
            submitterEmail: user.email || prev.submitterEmail,
            submitterName: user.display_name || prev.submitterName,
          }));
          setPrefillNote('Sei autenticato come farmacista. Collega una scheda dalla dashboard per precompilare i dati.');
        }
      } catch (error) {
        console.warn('Prefill farmacista non disponibile:', error);
      }
    };
    prefillFromAccount();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = useCallback((field) => (event) => {
    const { type, value, checked } = event.target;
    setFormState((prev) => ({
      ...prev,
      [field]: type === 'checkbox' ? checked : value,
    }));
  }, []);

  const validate = useCallback(() => {
    const nextErrors = {};
    const emailRegex = /\S+@\S+\.\S+/;

    if (!formState.pharmacyName.trim()) nextErrors.pharmacyName = 'Inserisci il nome della farmacia';
    if (!formState.pharmacyCity.trim()) nextErrors.pharmacyCity = 'Inserisci la città';
    if (!formState.pharmacyProvince.trim()) nextErrors.pharmacyProvince = 'Inserisci la provincia (2 lettere)';
    if (!formState.jobTitle.trim()) nextErrors.jobTitle = "Inserisci il titolo dell'offerta";
    if (!formState.jobCategory) nextErrors.jobCategory = 'Seleziona la categoria';
    if (!formState.contractType) nextErrors.contractType = 'Indica la tipologia di contratto';
    if (!formState.description.trim()) nextErrors.description = 'Inserisci una descrizione del ruolo';
    if (!formState.contactEmail.trim() || !emailRegex.test(formState.contactEmail)) {
      nextErrors.contactEmail = 'Inserisci una mail di contatto valida';
    }
    if (!formState.submitterEmail.trim() || !emailRegex.test(formState.submitterEmail)) {
      nextErrors.submitterEmail = 'Inserisci una mail valida per la conferma';
    }
    if (!formState.consentPrivacy) {
      nextErrors.consentPrivacy = 'È necessario accettare il trattamento dei dati';
    }
    if (!formState.consentResponsibility) {
      nextErrors.consentResponsibility = 'È necessario accettare le condizioni di responsabilità';
    }

    return nextErrors;
  }, [formState]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!clientIp) {
      setIpError('Impossibile determinare il tuo indirizzo IP. Ripeti più tardi.');
      return;
    }

    setErrors({});
    setIpError('');
    setIsSubmitting(true);

    try {
      const payload = {
        pharmacy_name: formState.pharmacyName.trim(),
        pharmacy_address: formState.pharmacyAddress.trim() || null,
        pharmacy_city: formState.pharmacyCity.trim(),
        pharmacy_province: formState.pharmacyProvince.trim().toUpperCase(),
        pharmacy_zip: formState.pharmacyZip.trim() || null,
        pharmacy_email: formState.pharmacyEmail.trim() || null,
        pharmacy_phone: formState.pharmacyPhone.trim() || null,
        pharmacy_website: formState.pharmacyWebsite.trim() || null,
        pharmacy_maps_url: formState.pharmacyMapsUrl.trim() || null,
        job_title: formState.jobTitle.trim(),
        job_category: formState.jobCategory,
        contract_type: formState.contractType,
        working_hours: formState.workingHours.trim() || null,
        salary_range: formState.salaryRange.trim() || null,
        description: formState.description.trim(),
        requirements: sanitizeMultiline(formState.requirements),
        benefits: sanitizeMultiline(formState.benefits),
        additional_notes: formState.notes.trim() || null,
        contact_email: formState.contactEmail.trim(),
        contact_phone: formState.contactPhone.trim() || null,
        submitter_name: formState.submitterName.trim() || null,
        submitter_email: formState.submitterEmail.trim(),
        consent_privacy: formState.consentPrivacy,
        consent_responsibility: formState.consentResponsibility,
        submitter_ip: clientIp,
        claimed_pharmacy_id: claimedPharmacyId,
      };

      const response = await fetch('/api/marketplace/submit-job', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || 'Invio non riuscito');
      }

      toast({
        title: 'Richiesta inviata',
        description: result.linked_pharmacy
          ? 'Annuncio collegato alla tua scheda farmacia. Sarà pubblicato dopo la revisione.'
          : 'Grazie! Il tuo annuncio verrà revisionato dal nostro team prima della pubblicazione.',
      });
      setFormState(INITIAL_FORM_STATE);
      setClientIp(clientIp);
      setIpError('');
      if (linkedUser) {
        setPrefillNote('Puoi inviare un altro annuncio: i dati account restano disponibili dopo un refresh.');
      }
    } catch (error) {
      console.error('Errore invio offerta:', error);
      setIpError(error.message || 'Non è stato possibile inviare la richiesta. Riprova più tardi.');
      toast({
        title: 'Invio non riuscito',
        description: error.message || 'Non è stato possibile inviare la richiesta, riprova.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const emailRegex = /\S+@\S+\.\S+/;
  const mandatoryFilled =
    formState.pharmacyName.trim() &&
    formState.pharmacyCity.trim() &&
    formState.pharmacyProvince.trim().length === 2 &&
    formState.jobTitle.trim() &&
    formState.jobCategory &&
    formState.contractType &&
    formState.description.trim() &&
    emailRegex.test(formState.contactEmail) &&
    emailRegex.test(formState.submitterEmail) &&
    formState.consentPrivacy &&
    formState.consentResponsibility;

  const canSubmit =
    mandatoryFilled &&
    !isSubmitting &&
    !isIpLoading &&
    Boolean(clientIp);

  const submitButtonClasses = canSubmit
    ? 'pharmacy-button-primary w-full md:w-auto px-8 py-3 text-base font-semibold'
    : 'w-full md:w-auto px-8 py-3 text-base font-semibold rounded-lg bg-gray-300 text-gray-500 cursor-not-allowed border border-gray-200';

  return (
    <>

      <div className="bg-gradient-to-br from-green-50 via-white to-white py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[2fr,1fr] gap-10">
            <div>
              <div className="mb-8">
                <span className="text-sm font-semibold uppercase tracking-wide text-green-600">Pubblica un annuncio</span>
                <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900">
                  Pubblica un annuncio se stai assumendo in farmacia
                </h1>
                <p className="mt-4 text-lg text-gray-600">
                  Questa pagina serve a chi cerca personale, non a chi cerca lavoro. Inserisci la sede che assume,
                  i dettagli dell&apos;offerta e il contatto che riceverà le candidature: dopo la revisione editoriale
                  l&apos;annuncio viene pubblicato nella sezione <a className="font-semibold text-green-700 underline" href="/lavoro/">Lavoro</a>.
                </p>
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Non esiste ancora una bacheca &quot;offresi&quot; e da qui non si invia il CV alle farmacie della citt&agrave;:
                  i candidati rispondono ai singoli annunci pubblicati oppure usano l&apos;
                  <a className="font-semibold underline" href="/lavoro/area-candidati/">area candidati</a>.
                </div>
                {prefillNote ? (
                  <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {prefillNote}
                  </p>
                ) : null}
              </div>

              <form onSubmit={handleSubmit} className="bg-white border border-gray-100 shadow-sm rounded-xl p-6 space-y-10">
                <section>
                  <h2 className="text-xl font-semibold text-gray-900">Sede che assume</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Questi dati servono per associare l&apos;annuncio alla farmacia che sta cercando personale e per
                    creare la pagina pubblica dell&apos;offerta nel posto giusto.
                  </p>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label htmlFor="pharmacyName" className="block text-sm font-medium text-gray-700">
                        Nome della farmacia che assume *
                      </label>
                      <input
                        id="pharmacyName"
                        type="text"
                        value={formState.pharmacyName}
                        onChange={handleChange('pharmacyName')}
                        className={`mt-2 w-full rounded-lg border ${errors.pharmacyName ? 'border-red-300' : 'border-gray-200'} px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                      />
                      {errors.pharmacyName && <p className="mt-1 text-sm text-red-500">{errors.pharmacyName}</p>}
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="pharmacyAddress" className="block text-sm font-medium text-gray-700">
                        Indirizzo della sede
                      </label>
                      <input
                        id="pharmacyAddress"
                        type="text"
                        value={formState.pharmacyAddress}
                        onChange={handleChange('pharmacyAddress')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                        placeholder="Via, numero civico, CAP"
                      />
                    </div>

                    <div>
                      <label htmlFor="pharmacyCity" className="block text-sm font-medium text-gray-700">
                        Città *
                      </label>
                      <input
                        id="pharmacyCity"
                        type="text"
                        value={formState.pharmacyCity}
                        onChange={handleChange('pharmacyCity')}
                        className={`mt-2 w-full rounded-lg border ${errors.pharmacyCity ? 'border-red-300' : 'border-gray-200'} px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                      />
                      {errors.pharmacyCity && <p className="mt-1 text-sm text-red-500">{errors.pharmacyCity}</p>}
                    </div>

                    <div>
                      <label htmlFor="pharmacyProvince" className="block text-sm font-medium text-gray-700">
                        Provincia (sigla) *
                      </label>
                      <input
                        id="pharmacyProvince"
                        type="text"
                        maxLength={2}
                        value={formState.pharmacyProvince}
                        onChange={handleChange('pharmacyProvince')}
                        className={`mt-2 w-full rounded-lg border ${errors.pharmacyProvince ? 'border-red-300' : 'border-gray-200'} px-4 py-3 uppercase focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                      />
                      {errors.pharmacyProvince && <p className="mt-1 text-sm text-red-500">{errors.pharmacyProvince}</p>}
                    </div>

                    <div>
                      <label htmlFor="pharmacyZip" className="block text-sm font-medium text-gray-700">
                        CAP
                      </label>
                      <input
                        id="pharmacyZip"
                        type="text"
                        value={formState.pharmacyZip}
                        onChange={handleChange('pharmacyZip')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                      />
                    </div>

                    <div>
                      <label htmlFor="pharmacyEmail" className="block text-sm font-medium text-gray-700">
                        Email farmacia / sede
                      </label>
                      <input
                        id="pharmacyEmail"
                        type="email"
                        value={formState.pharmacyEmail}
                        onChange={handleChange('pharmacyEmail')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                      />
                    </div>

                    <div>
                      <label htmlFor="pharmacyPhone" className="block text-sm font-medium text-gray-700">
                        Telefono farmacia / sede
                      </label>
                      <input
                        id="pharmacyPhone"
                        type="tel"
                        value={formState.pharmacyPhone}
                        onChange={handleChange('pharmacyPhone')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                      />
                    </div>

                    <div>
                      <label htmlFor="pharmacyWebsite" className="block text-sm font-medium text-gray-700">
                        Sito web
                      </label>
                      <input
                        id="pharmacyWebsite"
                        type="url"
                        value={formState.pharmacyWebsite}
                        onChange={handleChange('pharmacyWebsite')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                        placeholder="https://"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="pharmacyMapsUrl" className="block text-sm font-medium text-gray-700">
                        Link Google Maps (opzionale)
                      </label>
                      <input
                        id="pharmacyMapsUrl"
                        type="url"
                        value={formState.pharmacyMapsUrl}
                        onChange={handleChange('pharmacyMapsUrl')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                        placeholder="https://www.google.com/maps..."
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900">Dettagli dell'offerta</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Inserisci tutte le informazioni utili per i candidati.
                  </p>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label htmlFor="jobTitle" className="block text-sm font-medium text-gray-700">
                        Titolo annuncio *
                      </label>
                      <input
                        id="jobTitle"
                        type="text"
                        value={formState.jobTitle}
                        onChange={handleChange('jobTitle')}
                        className={`mt-2 w-full rounded-lg border ${errors.jobTitle ? 'border-red-300' : 'border-gray-200'} px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                      />
                      {errors.jobTitle && <p className="mt-1 text-sm text-red-500">{errors.jobTitle}</p>}
                    </div>

                    <div>
                      <label htmlFor="jobCategory" className="block text-sm font-medium text-gray-700">
                        Categoria *
                      </label>
                      <select
                        id="jobCategory"
                        value={formState.jobCategory}
                        onChange={handleChange('jobCategory')}
                        className={`mt-2 w-full rounded-lg border ${errors.jobCategory ? 'border-red-300' : 'border-gray-200'} bg-white px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                      >
                        {categories.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {errors.jobCategory && <p className="mt-1 text-sm text-red-500">{errors.jobCategory}</p>}
                    </div>

                    <div>
                      <label htmlFor="contractType" className="block text-sm font-medium text-gray-700">
                        Tipologia di contratto *
                      </label>
                      <select
                        id="contractType"
                        value={formState.contractType}
                        onChange={handleChange('contractType')}
                        className={`mt-2 w-full rounded-lg border ${errors.contractType ? 'border-red-300' : 'border-gray-200'} bg-white px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                      >
                        {contractOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {errors.contractType && <p className="mt-1 text-sm text-red-500">{errors.contractType}</p>}
                    </div>

                    <div>
                      <label htmlFor="workingHours" className="block text-sm font-medium text-gray-700">
                        Orario / turni
                      </label>
                      <input
                        id="workingHours"
                        type="text"
                        value={formState.workingHours}
                        onChange={handleChange('workingHours')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                        placeholder="Es. 40 ore settimanali, turni, festivi..."
                      />
                    </div>

                    <div>
                      <label htmlFor="salaryRange" className="block text-sm font-medium text-gray-700">
                        Range retributivo (opzionale)
                      </label>
                      <input
                        id="salaryRange"
                        type="text"
                        value={formState.salaryRange}
                        onChange={handleChange('salaryRange')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                        placeholder="Es. CCNL Farmacie, RAL, benefit..."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                        Descrizione dettagliata *
                      </label>
                      <textarea
                        id="description"
                        value={formState.description}
                        onChange={handleChange('description')}
                        rows={6}
                        className={`mt-2 w-full rounded-lg border ${errors.description ? 'border-red-300' : 'border-gray-200'} px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                        placeholder="Descrivi il ruolo, le attività principali, cosa offrite..."
                      />
                      {errors.description && <p className="mt-1 text-sm text-red-500">{errors.description}</p>}
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="requirements" className="block text-sm font-medium text-gray-700">
                        Requisiti richiesti (uno per riga)
                      </label>
                      <textarea
                        id="requirements"
                        value={formState.requirements}
                        onChange={handleChange('requirements')}
                        rows={4}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                        placeholder="Es. Abilitazione all'albo\nEsperienza di 2 anni"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="benefits" className="block text-sm font-medium text-gray-700">
                        Benefit e plus (uno per riga)
                      </label>
                      <textarea
                        id="benefits"
                        value={formState.benefits}
                        onChange={handleChange('benefits')}
                        rows={4}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                        placeholder="Es. Alloggio incluso\nPercorsi di formazione"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                        Note interne per la redazione (non verranno pubblicate)
                      </label>
                      <textarea
                        id="notes"
                        value={formState.notes}
                        onChange={handleChange('notes')}
                        rows={3}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold text-gray-900">Contatti e autorizzazioni</h2>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="submitterName" className="block text-sm font-medium text-gray-700">
                        Nome referente
                      </label>
                      <input
                        id="submitterName"
                        type="text"
                        value={formState.submitterName}
                        onChange={handleChange('submitterName')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                      />
                    </div>

                    <div>
                      <label htmlFor="submitterEmail" className="block text-sm font-medium text-gray-700">
                        Email referente *
                      </label>
                      <input
                        id="submitterEmail"
                        type="email"
                        value={formState.submitterEmail}
                        onChange={handleChange('submitterEmail')}
                        className={`mt-2 w-full rounded-lg border ${errors.submitterEmail ? 'border-red-300' : 'border-gray-200'} px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                      />
                      {errors.submitterEmail && <p className="mt-1 text-sm text-red-500">{errors.submitterEmail}</p>}
                    </div>

                    <div>
                      <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700">
                        Email per candidature *
                      </label>
                      <input
                        id="contactEmail"
                        type="email"
                        value={formState.contactEmail}
                        onChange={handleChange('contactEmail')}
                        className={`mt-2 w-full rounded-lg border ${errors.contactEmail ? 'border-red-300' : 'border-gray-200'} px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200`}
                      />
                      {errors.contactEmail && <p className="mt-1 text-sm text-red-500">{errors.contactEmail}</p>}
                    </div>

                    <div>
                      <label htmlFor="contactPhone" className="block text-sm font-medium text-gray-700">
                        Telefono per candidature
                      </label>
                      <input
                        id="contactPhone"
                        type="tel"
                        value={formState.contactPhone}
                        onChange={handleChange('contactPhone')}
                        className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-green-500 focus:ring-2 focus:ring-green-200"
                      />
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formState.consentPrivacy}
                        onChange={handleChange('consentPrivacy')}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-600">
                        Confermo di aver letto e accettato l'<a className="text-green-600 underline" href="https://www.prontofarmacie.it/privacy-policy/" target="_blank" rel="noreferrer">informativa privacy</a> e autorizzo ProntoFarmacie al trattamento dei miei dati personali ai sensi del GDPR.
                      </span>
                    </label>
                    {errors.consentPrivacy && <p className="text-sm text-red-500">{errors.consentPrivacy}</p>}

                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={formState.consentResponsibility}
                        onChange={handleChange('consentResponsibility')}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-600">
                        Dichiaro di avere l'autorizzazione a pubblicare questo annuncio e assumo la responsabilità sui contenuti inviati, sollevando ProntoFarmacie da eventuali inesattezze o violazioni.
                      </span>
                    </label>
                    {errors.consentResponsibility && <p className="text-sm text-red-500">{errors.consentResponsibility}</p>}
                  </div>

                  <div className="mt-8 space-y-3">
                    <Button
                      type="submit"
                      disabled={!canSubmit}
                      className={submitButtonClasses}
                    >
                      {isSubmitting ? 'Invio in corso...' : 'Invia per approvazione'}
                    </Button>
                    {isIpLoading && (
                      <p className="text-sm text-gray-500">
                        Rilevamento indirizzo IP in corso...
                      </p>
                    )}
                    {clientIp && !isIpLoading && (
                      <p className="text-xs text-gray-500">
                        Il tuo indirizzo IP (<span className="font-mono">{clientIp}</span>) può inviare solo un’offerta ogni 24 ore.
                      </p>
                    )}
                    {ipError && (
                      <p className="text-sm text-red-500">{ipError}</p>
                    )}
                  </div>
                </section>
              </form>
            </div>

            <aside className="space-y-6">
              <div className="rounded-2xl border border-green-100 bg-green-50/80 p-6">
                <h2 className="text-lg font-semibold text-green-900">Cosa succede dopo l&apos;invio</h2>
                <ul className="mt-4 space-y-3 text-sm text-green-900/80">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                    <span>Compili i dati della sede che assume e dell&apos;offerta da pubblicare.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                    <span>Ricevi una mail di riepilogo e il team controlla contenuti, contatti e coerenza dell&apos;annuncio.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                    <span>Se approvato, l&apos;annuncio viene pubblicato come pagina offerta dentro il portale <a className="font-semibold underline" href="/lavoro/">/lavoro/</a> e compare nelle pagine citt&agrave;/ruolo pertinenti.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 p-6">
                <h2 className="text-lg font-semibold text-indigo-900">Questa pagina non fa</h2>
                <ul className="mt-4 space-y-3 text-sm text-indigo-900/80">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-indigo-600" />
                    <span>Non crea una bacheca profili &quot;offresi&quot; per candidati.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-indigo-600" />
                    <span>Non invia automaticamente il CV a tutte le farmacie di una citt&agrave;.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-indigo-600" />
                    <span>Chi cerca lavoro deve usare gli annunci pubblicati o l&apos;<a className="font-semibold underline" href="/lavoro/area-candidati/">area candidati</a>.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Protezione anti-abuso</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Limitiamo gli invii a un annuncio per indirizzo IP ogni 24 ore per evitare spam e mantenere alta la qualità del portale.
                </p>
                <div className="mt-4 flex items-center gap-3 text-sm text-gray-500">
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                  <span>Registriamo l’IP dell’invio solo per prevenire abusi: non viene pubblicato né condiviso.</span>
                </div>
                <div className="mt-4 flex items-center gap-3 text-sm text-gray-500">
                  <Lock className="h-5 w-5 text-green-500" />
                  <span>Tutti i dati viaggiano in modo crittografato su Supabase.</span>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
};

export default JobSubmissionPage;
