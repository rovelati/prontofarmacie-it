import React, { useCallback, useEffect, useState } from 'react';

const DAYS = [
  ['lunedi', 'Lunedì'],
  ['martedi', 'Martedì'],
  ['mercoledi', 'Mercoledì'],
  ['giovedi', 'Giovedì'],
  ['venerdi', 'Venerdì'],
  ['sabato', 'Sabato'],
  ['domenica', 'Domenica'],
];

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Errore HTTP ${response.status}`);
  }
  return payload;
}

export default function PharmacyDashboardApp() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [needsClaim, setNeedsClaim] = useState(false);
  const [claim, setClaim] = useState(null);
  const [pharmacy, setPharmacy] = useState(null);
  const [hours, setHours] = useState({});
  const [prices, setPrices] = useState([]);
  const [taxonomy, setTaxonomy] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [newServiceId, setNewServiceId] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const session = await api('/api/local-auth?action=session');
      if (!session.user || (session.user.role !== 'pharmacy_owner' && session.user.role !== 'admin')) {
        window.location.href = '/area-farmacia/accedi/';
        return;
      }
      setUser(session.user);
      const data = await api('/api/marketplace/pharmacy?action=dashboard');
      setNeedsClaim(Boolean(data.needsClaim));
      setClaim(data.claim || null);
      setPharmacy(data.pharmacy || null);
      const oh = data.pharmacy?.opening_hours || {};
      const normalized = {};
      for (const [key] of DAYS) {
        const raw = oh[key] ?? oh[key.replace('i', 'ì')] ?? '';
        normalized[key] = Array.isArray(raw) ? raw.join(', ') : String(raw || '');
      }
      setHours(normalized);
      setPrices(data.prices || []);
      const tax = await api('/api/marketplace/pharmacy?action=taxonomy');
      setTaxonomy(tax.taxonomy || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Caricamento fallito');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const searchPharmacies = async () => {
    setError('');
    try {
      const data = await api(`/api/marketplace/pharmacy?action=search&q=${encodeURIComponent(searchQ)}`);
      setSearchResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ricerca fallita');
    }
  };

  const claimPharmacy = async (pharmacyId) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/api/marketplace/pharmacy', {
        method: 'POST',
        body: JSON.stringify({ action: 'claim', pharmacy_id: pharmacyId }),
      });
      setMessage(result.message || 'Richiesta inviata');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim fallito');
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!pharmacy) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const opening_hours = {};
      for (const [key] of DAYS) {
        const slots = String(hours[key] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        opening_hours[key] = slots;
      }
      await api('/api/marketplace/pharmacy', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save_profile',
          phone: pharmacy.phone,
          email: pharmacy.email,
          website: pharmacy.website,
          description: pharmacy.description,
          opening_hours,
        }),
      });
      setMessage('Scheda aggiornata.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio fallito');
    } finally {
      setSaving(false);
    }
  };

  const savePrices = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api('/api/marketplace/pharmacy', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save_prices',
          prices: prices.map((p) => ({
            service_id: p.service_id,
            price: Number(p.price),
            context: p.context || null,
          })),
        }),
      });
      setMessage('Listino servizi salvato.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio listino fallito');
    } finally {
      setSaving(false);
    }
  };

  const addPrice = () => {
    if (!newServiceId || !newPrice) return;
    if (prices.some((p) => p.service_id === newServiceId)) {
      setError('Servizio già presente nel listino.');
      return;
    }
    const tax = taxonomy.find((t) => t.id === newServiceId);
    setPrices((prev) => [
      ...prev,
      {
        service_id: newServiceId,
        price: Number(newPrice),
        service_name: tax?.name || 'Servizio',
        category: tax?.category || '',
      },
    ]);
    setNewServiceId('');
    setNewPrice('');
  };

  const logout = async () => {
    await api('/api/local-auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
    window.location.href = '/area-farmacia/';
  };

  if (loading) {
    return <p className="text-sm text-gray-600">Caricamento area farmacia…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Area farmacia</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">Gestisci la tua scheda</h1>
          <p className="mt-1 text-sm text-gray-600">
            Orari aggiornati e listino servizi: ciò che cercano gli utenti sul marketplace.
          </p>
          {user ? <p className="mt-2 text-xs text-gray-500">{user.email}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/lavoro/inserisci-annuncio/"
            className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
          >
            Pubblica offerta lavoro
          </a>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
          >
            Esci
          </button>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}

      {needsClaim || !pharmacy ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900">Collega la tua farmacia</h2>
          <p className="mt-1 text-sm text-gray-600">
            Cerca la scheda e reclamala. Se l&apos;email coincide con quella in anagrafica, l&apos;approvazione è automatica.
          </p>
          {claim?.status === 'pending' ? (
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-amber-800">
              Richiesta in attesa per: {claim.name || claim.pharmacy_id}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="min-w-[220px] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="Nome, città o slug…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
            <button
              type="button"
              onClick={searchPharmacies}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Cerca
            </button>
          </div>
          <ul className="mt-4 space-y-2">
            {searchResults.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-500">
                    {[item.address, item.city, item.province].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => claimPharmacy(item.id)}
                  className="rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Collega
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900">{pharmacy.name}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {pharmacy.address}
              {pharmacy.city ? ` · ${pharmacy.city}` : ''}
              {pharmacy.prontofarmacie_slug ? (
                <>
                  {' '}
                  ·{' '}
                  <a className="text-emerald-700 hover:underline" href={`/farmacia/${pharmacy.prontofarmacie_slug}/`}>
                    Vedi scheda pubblica
                  </a>
                </>
              ) : null}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Telefono</span>
                <input
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  value={pharmacy.phone || ''}
                  onChange={(e) => setPharmacy({ ...pharmacy, phone: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Email</span>
                <input
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  value={pharmacy.email || ''}
                  onChange={(e) => setPharmacy({ ...pharmacy, email: e.target.value })}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-gray-700">Sito web</span>
                <input
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  value={pharmacy.website || ''}
                  onChange={(e) => setPharmacy({ ...pharmacy, website: e.target.value })}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-gray-700">Descrizione</span>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  value={pharmacy.description || ''}
                  onChange={(e) => setPharmacy({ ...pharmacy, description: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900">Orari di apertura</h2>
            <p className="mt-1 text-sm text-gray-600">Usa fasce tipo <code>09:00-13:00, 15:30-19:30</code> oppure lascia vuoto se chiuso.</p>
            <div className="mt-4 space-y-2">
              {DAYS.map(([key, label]) => (
                <div key={key} className="flex flex-wrap items-center gap-2">
                  <span className="w-24 text-sm font-medium text-gray-700">{label}</span>
                  <input
                    className="min-w-[220px] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={hours[key] || ''}
                    onChange={(e) => setHours({ ...hours, [key]: e.target.value })}
                    placeholder="chiuso oppure 09:00-13:00, 16:00-20:00"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={saveProfile}
              className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Salva contatti e orari
            </button>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900">Listino servizi</h2>
            <p className="mt-1 text-sm text-gray-600">
              Prezzi che gli utenti vedono quando cercano un servizio in farmacia.
            </p>
            <ul className="mt-4 space-y-2">
              {prices.map((item) => (
                <li key={item.service_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
                  <div className="min-w-[160px] flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.service_name}</p>
                    <p className="text-xs text-gray-500">{item.category}</p>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    value={item.price}
                    onChange={(e) =>
                      setPrices((prev) =>
                        prev.map((p) =>
                          p.service_id === item.service_id ? { ...p, price: e.target.value } : p,
                        ),
                      )
                    }
                  />
                  <span className="text-sm text-gray-500">€</span>
                  <button
                    type="button"
                    className="text-sm text-rose-600"
                    onClick={() => setPrices((prev) => prev.filter((p) => p.service_id !== item.service_id))}
                  >
                    Rimuovi
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <select
                className="min-w-[200px] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                value={newServiceId}
                onChange={(e) => setNewServiceId(e.target.value)}
              >
                <option value="">Aggiungi servizio…</option>
                {taxonomy.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.category} — {t.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Prezzo €"
                className="w-28 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
              <button type="button" onClick={addPrice} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium">
                Aggiungi
              </button>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={savePrices}
              className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Salva listino
            </button>
          </section>
        </>
      )}
    </div>
  );
}
