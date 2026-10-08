import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'In attesa' },
  { value: 'approved', label: 'Approvate' },
  { value: 'rejected', label: 'Rifiutate' },
  { value: 'all', label: 'Tutte' },
];

const USER_ROLE_OPTIONS = [
  { value: 'all', label: 'Tutti' },
  { value: 'pharmacy_owner', label: 'Farmacisti' },
  { value: 'job_seeker', label: 'Candidati' },
  { value: 'admin', label: 'Admin' },
];

const ROLE_LABELS = {
  pharmacy_owner: 'Farmacista',
  job_seeker: 'Candidato',
  admin: 'Admin',
};

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  revoked: 'bg-slate-100 text-slate-600 border-slate-200',
};

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

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export default function AdminJobApprovals({
  embedded = false,
  lockedTab = null,
} = {}) {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [tab, setTab] = useState(lockedTab || 'users');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userQuery, setUserQuery] = useState('');
  const [userQueryDraft, setUserQueryDraft] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [claims, setClaims] = useState([]);
  const [users, setUsers] = useState([]);
  const [userCounts, setUserCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [allowUnauth, setAllowUnauth] = useState(false);

  useEffect(() => {
    if (lockedTab) setTab(lockedTab);
  }, [lockedTab]);

  const bootstrap = useCallback(async () => {
    try {
      const session = await api('/api/local-auth?action=session');
      if (session.user?.role === 'admin') {
        setUser(session.user);
        return;
      }
      // In admin-test con ADMIN_TEST_ALLOW_UNAUTH le API marketplace rispondono senza sessione.
      const probe = await fetch('/api/marketplace/admin?resource=stats', { credentials: 'same-origin' });
      const payload = await probe.json().catch(() => ({}));
      if (probe.ok && payload.success) {
        setAllowUnauth(Boolean(payload.allowUnauth));
        setUser(session.user || { id: 'admin-test', email: 'admin-test@local', role: 'admin' });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (tab === 'claims') {
        const data = await api(`/api/marketplace/admin?resource=claims&status=${encodeURIComponent(statusFilter)}`);
        setClaims(data.claims || []);
      } else if (tab === 'users') {
        const params = new URLSearchParams({
          resource: 'users',
          role: userRoleFilter,
        });
        if (userQuery.trim()) params.set('q', userQuery.trim());
        const data = await api(`/api/marketplace/admin?${params.toString()}`);
        setUsers(data.users || []);
        setUserCounts(data.counts || {});
      } else {
        const data = await api(
          `/api/marketplace/admin?resource=submissions&status=${encodeURIComponent(statusFilter)}`,
        );
        setSubmissions(data.submissions || []);
        setNoteDrafts(
          (data.submissions || []).reduce((acc, submission) => {
            if (submission.admin_notes) acc[submission.id] = submission.admin_notes;
            return acc;
          }, {}),
        );
      }
    } catch (error) {
      toast({
        title: 'Caricamento fallito',
        description: error.message || 'Riprova.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, tab, statusFilter, userRoleFilter, userQuery, toast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    try {
      const payload = await api('/api/local-auth', {
        method: 'POST',
        body: JSON.stringify({
          action: 'login',
          email: authForm.email,
          password: authForm.password,
        }),
      });
      if (payload.user?.role !== 'admin') {
        await api('/api/local-auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
        throw new Error('Questo account non ha privilegi admin.');
      }
      setUser(payload.user);
      toast({ title: 'Accesso effettuato', description: payload.user.email });
    } catch (error) {
      toast({
        title: 'Login non riuscito',
        description: error.message || 'Controlla email e password.',
        variant: 'destructive',
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await api('/api/local-auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
    setUser(null);
    setSubmissions([]);
    setClaims([]);
    setUsers([]);
  };

  const updateSubmission = async (submission, nextStatus) => {
    const confirmMessage =
      nextStatus === 'approved'
        ? 'Confermi la pubblicazione di questo annuncio?'
        : 'Confermi il rifiuto di questo annuncio?';
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;

    const notePayload = noteDrafts[submission.id]?.trim() || null;
    try {
      if (nextStatus === 'approved') {
        const publishPayload = await api('/api/marketplace/publish-job', {
          method: 'POST',
          body: JSON.stringify({ submission_id: submission.id }),
        });
        toast({
          title: 'Annuncio approvato e pubblicato',
          description: publishPayload.detail_url || `${submission.pharmacy_name} — ${submission.job_title}`,
        });
      } else {
        await api('/api/marketplace/admin', {
          method: 'POST',
          body: JSON.stringify({
            action: 'reject_submission',
            submission_id: submission.id,
            admin_notes: notePayload,
          }),
        });
        toast({
          title: 'Annuncio rifiutato',
          description: `${submission.pharmacy_name} — ${submission.job_title}`,
        });
      }
      setRefreshIndex((n) => n + 1);
    } catch (error) {
      toast({
        title: 'Aggiornamento non riuscito',
        description: error.message || 'Riprova.',
        variant: 'destructive',
      });
    }
  };

  const updateClaim = async (claim, nextStatus) => {
    const confirmMessage =
      nextStatus === 'approved'
        ? `Approvi il collegamento di ${claim.pharmacy_name} a ${claim.user_email}?`
        : `Rifiuti la richiesta di ${claim.user_email}?`;
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;

    try {
      await api('/api/marketplace/admin', {
        method: 'POST',
        body: JSON.stringify({
          action: nextStatus === 'approved' ? 'approve_claim' : 'reject_claim',
          claim_id: claim.id,
        }),
      });
      toast({
        title: nextStatus === 'approved' ? 'Claim approvato' : 'Claim rifiutato',
        description: claim.pharmacy_name,
      });
      setRefreshIndex((n) => n + 1);
    } catch (error) {
      toast({
        title: 'Operazione non riuscita',
        description: error.message || 'Riprova.',
        variant: 'destructive',
      });
    }
  };

  const toggleUserDisabled = async (row) => {
    const disable = !row.disabled_at;
    const confirmMessage = disable
      ? `Disabiliti l'account ${row.email}?`
      : `Riattivi l'account ${row.email}?`;
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;

    try {
      await api('/api/marketplace/admin', {
        method: 'POST',
        body: JSON.stringify({
          action: disable ? 'disable_user' : 'enable_user',
          user_id: row.id,
        }),
      });
      toast({
        title: disable ? 'Account disabilitato' : 'Account riattivato',
        description: row.email,
      });
      setRefreshIndex((n) => n + 1);
    } catch (error) {
      toast({
        title: 'Operazione non riuscita',
        description: error.message || 'Riprova.',
        variant: 'destructive',
      });
    }
  };

  const rows = useMemo(() => {
    if (tab === 'claims') return claims;
    if (tab === 'users') return users;
    return submissions;
  }, [tab, claims, users, submissions]);

  if (!user) {
    return (
      <div className={embedded ? 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm' : 'min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-16 px-4 text-white'}>
        <div className={embedded ? 'mx-auto max-w-md' : 'mx-auto max-w-md rounded-2xl border border-white/20 bg-white/10 p-8 shadow-xl backdrop-blur-md'}>
          <div className="flex items-center gap-3">
            <LogIn className={`h-6 w-6 ${embedded ? 'text-slate-800' : ''}`} />
            <h1 className={`text-2xl font-bold ${embedded ? 'text-slate-900' : ''}`}>Accesso area riservata</h1>
          </div>
          <p className={`mt-4 text-sm ${embedded ? 'text-slate-600' : 'text-slate-200'}`}>
            Accedi con l&apos;account admin locale ProntoFarmacie per gestire utenti registrati, claim farmacie e offerte.
          </p>
          <form onSubmit={handleLogin} className="mt-8 space-y-6">
            <div>
              <label htmlFor="adminEmail" className={`block text-sm font-medium ${embedded ? 'text-slate-700' : 'text-slate-200'}`}>
                Email
              </label>
              <input
                id="adminEmail"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))}
                className={embedded
                  ? 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900'
                  : 'mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white'}
                required
              />
            </div>
            <div>
              <label htmlFor="adminPassword" className={`block text-sm font-medium ${embedded ? 'text-slate-700' : 'text-slate-200'}`}>
                Password
              </label>
              <input
                id="adminPassword"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
                className={embedded
                  ? 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900'
                  : 'mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white'}
                required
              />
            </div>
            <Button type="submit" disabled={authLoading} className="w-full">
              {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accedi'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-slate-50 py-10'}>
      <div className={embedded ? '' : 'mx-auto max-w-5xl px-4'}>
        {!embedded && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Console marketplace / CRM</h1>
            <p className="text-sm text-slate-600">{user.email}</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Esci
          </Button>
        </div>
        )}

        {embedded && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
            <span>
              Sessione approvazioni: <strong>{user.email}</strong>
              {allowUnauth ? ' (modalità test senza auth API)' : ''}
            </span>
            {user.id !== 'admin-test' && (
              <Button size="sm" variant="outline" onClick={handleLogout}>
                <LogOut className="mr-1 h-3.5 w-3.5" />
                Esci admin
              </Button>
            )}
          </div>
        )}

        {!lockedTab && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant={tab === 'users' ? 'default' : 'outline'} onClick={() => setTab('users')}>
            <Users className="mr-2 h-4 w-4" />
            CRM utenti
          </Button>
          <Button variant={tab === 'submissions' ? 'default' : 'outline'} onClick={() => setTab('submissions')}>
            Offerte lavoro
          </Button>
          <Button variant={tab === 'claims' ? 'default' : 'outline'} onClick={() => setTab('claims')}>
            Claim farmacie
          </Button>
        </div>
        )}

        {tab === 'users' ? (
          <>
            <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Farmacisti</div>
                <div className="text-2xl font-bold text-slate-900">{userCounts.pharmacy_owner || 0}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Candidati</div>
                <div className="text-2xl font-bold text-slate-900">{userCounts.job_seeker || 0}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Admin</div>
                <div className="text-2xl font-bold text-slate-900">{userCounts.admin || 0}</div>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {USER_ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setUserRoleFilter(opt.value)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    userRoleFilter === opt.value
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <form
              className="mb-4 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setUserQuery(userQueryDraft);
              }}
            >
              <input
                type="search"
                value={userQueryDraft}
                onChange={(e) => setUserQueryDraft(e.target.value)}
                placeholder="Cerca email o nome…"
                className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <Button type="submit" variant="outline">
                Cerca
              </Button>
            </form>
          </>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  statusFilter === opt.value
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            <Inbox className="mx-auto mb-3 h-8 w-8" />
            Nessun elemento in questo filtro.
          </div>
        ) : tab === 'users' ? (
          <div className="space-y-3">
            {users.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {row.display_name || row.email}
                    </div>
                    <div className="text-sm text-slate-600">{row.email}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>Registrato: {formatDateTime(row.created_at)}</span>
                      <span>Ultimo accesso: {formatDateTime(row.last_login_at)}</span>
                      {row.has_google ? <span>Google login</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">
                        Claim: {row.claims_count || 0}
                        {row.claims_approved ? ` (${row.claims_approved} ok)` : ''}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">
                        Alert: {row.alerts_count || 0}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">
                        Annunci: {row.submissions_count || 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        row.disabled_at
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {row.disabled_at ? 'Disabilitato' : ROLE_LABELS[row.role] || row.role}
                    </span>
                    {row.id !== user.id && (
                      <Button
                        size="sm"
                        variant={row.disabled_at ? 'outline' : 'destructive'}
                        onClick={() => toggleUserDisabled(row)}
                      >
                        {row.disabled_at ? 'Riattiva' : 'Disabilita'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'claims' ? (
          <div className="space-y-3">
            {claims.map((claim) => (
              <div key={claim.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{claim.pharmacy_name}</div>
                    <div className="text-sm text-slate-600">
                      {[claim.pharmacy_city, claim.pharmacy_province].filter(Boolean).join(' · ')}
                      {claim.prontofarmacie_slug ? ` · /farmacia/${claim.prontofarmacie_slug}/` : ''}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Richiedente: {claim.user_email}
                      {claim.pharmacy_email ? ` · scheda: ${claim.pharmacy_email}` : ''}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{formatDateTime(claim.created_at)}</div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      statusStyles[claim.status] || statusStyles.pending
                    }`}
                  >
                    {claim.status}
                  </span>
                </div>
                {claim.status === 'pending' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => updateClaim(claim, 'approved')}>
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Approva
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => updateClaim(claim, 'rejected')}>
                      <XCircle className="mr-1 h-4 w-4" />
                      Rifiuta
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((submission) => {
              const open = expandedId === submission.id;
              return (
                <div key={submission.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() => setExpandedId(open ? null : submission.id)}
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {submission.pharmacy_name} — {submission.job_title}
                      </div>
                      <div className="text-sm text-slate-600">
                        {submission.pharmacy_city} ({submission.pharmacy_province}) · {submission.job_category} ·{' '}
                        {submission.contract_type}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{formatDateTime(submission.created_at)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          statusStyles[submission.status] || statusStyles.pending
                        }`}
                      >
                        {submission.status === 'approved' && <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />}
                        {submission.status}
                      </span>
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>

                  {open && (
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm text-slate-700">
                      <p className="whitespace-pre-wrap">{submission.description}</p>
                      <div>
                        Contatto: {submission.contact_email}
                        {submission.contact_phone ? ` · ${submission.contact_phone}` : ''}
                      </div>
                      <div>
                        Mittente: {submission.submitter_email}
                        {submission.submitted_by_user_id ? ' · account collegato' : ''}
                      </div>
                      {submission.published_job_guid && (
                        <div>
                          Pubblicato:{' '}
                          <a
                            className="text-emerald-700 underline"
                            href={`/lavoro/offerta/${encodeURIComponent(submission.published_job_guid)}/`}
                          >
                            {submission.published_job_guid}
                          </a>
                        </div>
                      )}
                      <label className="block">
                        Note admin
                        <textarea
                          className="mt-1 w-full rounded-lg border border-slate-200 p-2"
                          rows={2}
                          value={noteDrafts[submission.id] || ''}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({ ...prev, [submission.id]: e.target.value }))
                          }
                        />
                      </label>
                      {submission.status === 'pending' && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => updateSubmission(submission, 'approved')}>
                            <CheckCircle2 className="mr-1 h-4 w-4" />
                            Approva e pubblica
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateSubmission(submission, 'rejected')}
                          >
                            <XCircle className="mr-1 h-4 w-4" />
                            Rifiuta
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
