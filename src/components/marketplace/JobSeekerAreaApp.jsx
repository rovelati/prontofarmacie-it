import React, { useCallback, useEffect, useState } from 'react';

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

export default function JobSeekerAreaApp() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    city: '',
    radius_km: '10',
    role_category: 'Farmacista',
    contract_type: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const session = await api('/api/local-auth?action=session');
      if (!session.user || (session.user.role !== 'job_seeker' && session.user.role !== 'admin')) {
        window.location.href = '/lavoro/area-candidati/accedi/';
        return;
      }
      setUser(session.user);
      const data = await api('/api/marketplace/job-alerts');
      setAlerts(data.alerts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Caricamento fallito');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createAlert = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/api/marketplace/job-alerts', {
        method: 'POST',
        body: JSON.stringify({ action: 'create', ...form, location_text: form.city }),
      });
      setMessage('Alert attivato.');
      setForm((prev) => ({ ...prev, city: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creazione alert fallita');
    }
  };

  const setStatus = async (id, status) => {
    setError('');
    try {
      await api('/api/marketplace/job-alerts', {
        method: 'POST',
        body: JSON.stringify({ action: 'set_status', id, status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aggiornamento fallito');
    }
  };

  const logout = async () => {
    await api('/api/local-auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
    window.location.href = '/lavoro/area-candidati/';
  };

  if (loading) return <p className="text-sm text-gray-600">Caricamento area candidati…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Area candidati</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">I tuoi alert lavoro</h1>
          <p className="mt-1 text-sm text-gray-600">
            Percorso dedicato a chi cerca lavoro in farmacia — separato dalla ricerca turni degli utenti.
          </p>
          {user ? <p className="mt-2 text-xs text-gray-500">{user.email}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/lavoro/" className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800">
            Vedi offerte
          </a>
          <button type="button" onClick={logout} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700">
            Esci
          </button>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900">Nuovo alert</h2>
        <form onSubmit={createAlert} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-gray-700">Località</span>
            <input
              required
              className="w-full rounded-xl border border-gray-300 px-3 py-2"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Milano, Roma…"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Raggio</span>
            <select
              className="w-full rounded-xl border border-gray-300 px-3 py-2"
              value={form.radius_km}
              onChange={(e) => setForm({ ...form, radius_km: e.target.value })}
            >
              <option value="10">10 km</option>
              <option value="25">25 km</option>
              <option value="50">50 km</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Ruolo</span>
            <select
              className="w-full rounded-xl border border-gray-300 px-3 py-2"
              value={form.role_category}
              onChange={(e) => setForm({ ...form, role_category: e.target.value })}
            >
              <option>Farmacista</option>
              <option>Direzione</option>
              <option>Magazzino</option>
              <option>Vendite</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-gray-700">Contratto (opzionale)</span>
            <input
              className="w-full rounded-xl border border-gray-300 px-3 py-2"
              value={form.contract_type}
              onChange={(e) => setForm({ ...form, contract_type: e.target.value })}
              placeholder="Tempo indeterminato, Part time…"
            />
          </label>
          <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">
            Attiva alert
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900">Alert attivi</h2>
        {alerts.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">Nessun alert ancora. Creane uno sopra.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {alerts.map((alert) => (
              <li key={alert.id} className="rounded-2xl border border-gray-100 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {alert.role_category} · {alert.location_text} · {alert.radius_km} km
                    </p>
                    <p className="text-xs text-gray-500">
                      Stato: {alert.status}
                      {alert.contract_type ? ` · ${alert.contract_type}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {alert.status === 'active' ? (
                      <button type="button" className="text-sm text-amber-700" onClick={() => setStatus(alert.id, 'paused')}>
                        Pausa
                      </button>
                    ) : (
                      <button type="button" className="text-sm text-emerald-700" onClick={() => setStatus(alert.id, 'active')}>
                        Riattiva
                      </button>
                    )}
                    <button type="button" className="text-sm text-rose-600" onClick={() => setStatus(alert.id, 'unsubscribed')}>
                      Disattiva
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
