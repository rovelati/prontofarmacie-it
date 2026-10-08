import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient.ts';

const INITIAL_STATE = {
  city: '',
  radiusKm: '10',
  roleCategory: 'Farmacista',
  contractType: '',
  email: '',
  consentPrivacy: false,
};

const EMAIL_RE = /\S+@\S+\.\S+/;

export default function JobRadarSignup() {
  const [form, setForm] = useState(INITIAL_STATE);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const canSubmit = useMemo(
    () =>
      form.city.trim().length >= 2 &&
      EMAIL_RE.test(form.email.trim()) &&
      form.consentPrivacy &&
      status !== 'submitting',
    [form, status],
  );

  const updateField = (field) => (event) => {
    const { type, value, checked } = event.target;
    setForm((prev) => ({ ...prev, [field]: type === 'checkbox' ? checked : value }));
  };

  const openSearch = () => {
    const city = form.city.trim();
    if (!city) return;
    const params = new URLSearchParams({
      city,
      role: form.roleCategory.toLowerCase(),
    });
    window.location.href = `/lavoro/cerca?${params.toString()}`;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setStatus('error');
      setMessage('Inserisci località, email valida e consenso privacy.');
      return;
    }

    setStatus('submitting');
    setMessage('');

    const payload = {
      email: form.email.trim().toLowerCase(),
      location_text: form.city.trim(),
      radius_km: Number(form.radiusKm),
      role_category: form.roleCategory,
      contract_type: form.contractType || null,
      source: 'lavoro_home',
      status: 'active',
      consent_privacy: form.consentPrivacy,
      user_agent: navigator.userAgent,
    };

    const { error } = await supabase.from('job_search_alerts').insert([payload]);

    if (error) {
      console.error('Job radar signup failed:', error);
      setStatus('error');
      setMessage("Non sono riuscito ad attivare l'alert. Verifica che la tabella job_search_alerts sia stata creata.");
      return;
    }

    setStatus('success');
    setMessage(`Radar attivato: ti avviseremo per nuove offerte ${form.roleCategory.toLowerCase()} entro ${form.radiusKm} km da ${form.city.trim()}.`);
    setForm(INITIAL_STATE);
  };

  return (
    <div className="rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Radar lavoro 10 km</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900 sm:text-2xl">Ricevi offerte vicino a te</h2>
          <p className="mt-1 text-sm text-gray-600">
            Salva località e raggio: ti avvisiamo quando esce un annuncio compatibile.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          aria-expanded={isOpen}
        >
          {isOpen ? 'Chiudi' : 'Apri'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className={`${isOpen ? 'grid' : 'hidden'} mt-4 gap-3 lg:grid-cols-12`}>
        <label className="lg:col-span-3">
          <span className="text-xs font-semibold text-gray-700">Località</span>
          <input
            type="text"
            value={form.city}
            onChange={updateField('city')}
            placeholder="Es. Milano"
            className="mt-1 h-12 w-full rounded-xl border border-gray-300 px-4 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          />
        </label>
        <label className="lg:col-span-2">
          <span className="text-xs font-semibold text-gray-700">Raggio</span>
          <select
            value={form.radiusKm}
            onChange={updateField('radiusKm')}
            className="mt-1 h-12 w-full rounded-xl border border-gray-300 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          >
            <option value="10">10 km</option>
            <option value="25">25 km</option>
            <option value="50">50 km</option>
          </select>
        </label>
        <label className="lg:col-span-2">
          <span className="text-xs font-semibold text-gray-700">Ruolo</span>
          <select
            value={form.roleCategory}
            onChange={updateField('roleCategory')}
            className="mt-1 h-12 w-full rounded-xl border border-gray-300 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          >
            <option>Farmacista</option>
            <option>Direzione</option>
            <option>Magazzino</option>
            <option>Vendite</option>
          </select>
        </label>
        <label className="lg:col-span-2">
          <span className="text-xs font-semibold text-gray-700">Contratto</span>
          <select
            value={form.contractType}
            onChange={updateField('contractType')}
            className="mt-1 h-12 w-full rounded-xl border border-gray-300 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          >
            <option value="">Qualsiasi</option>
            <option>Tempo indeterminato</option>
            <option>Tempo determinato</option>
            <option>Part time</option>
            <option>Full time</option>
          </select>
        </label>
        <label className="lg:col-span-3">
          <span className="text-xs font-semibold text-gray-700">Email</span>
          <input
            type="email"
            value={form.email}
            onChange={updateField('email')}
            placeholder="nome@email.it"
            className="mt-1 h-12 w-full rounded-xl border border-gray-300 px-4 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          />
        </label>

        <div className="lg:col-span-12 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={form.consentPrivacy}
              onChange={updateField('consentPrivacy')}
              className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600"
            />
            <span>Acconsento a ricevere alert lavoro pertinenti alla ricerca salvata.</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={openSearch}
              className="rounded-xl border border-emerald-200 px-5 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Vedi offerte ora
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={canSubmit
                ? 'rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800'
                : 'cursor-not-allowed rounded-xl bg-gray-200 px-5 py-3 text-sm font-semibold text-gray-500'}
            >
              {status === 'submitting' ? 'Attivazione…' : 'Attiva radar'}
            </button>
          </div>
        </div>
      </form>

      {message && (
        <p className={status === 'success' ? 'mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800' : 'mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900'}>
          {message}
        </p>
      )}
    </div>
  );
}
