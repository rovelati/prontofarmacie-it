import { useState } from 'react';
import type { PharmacyMapPoint } from '@/components/TurniMapIsland';
import {
  NEAR_ME_EXTENDED_MAX_KM,
  NEAR_ME_PREFERRED_KM,
  rankPointsWithExtendedSearch,
} from '@/lib/geoTurni';
import { scrollToTurniMap } from '@/lib/scrollToTurniMap';

interface CardItem extends PharmacyMapPoint {
  id: string;
  city: string;
  phone?: string | null;
  detailLink: string;
}

interface Props {
  allPoints: PharmacyMapPoint[];
  cards: CardItem[];
}

function formatKm(km: number): string {
  return km.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function TurniNearMeControls({ allPoints, cards }: Props) {
  const [mode, setMode] = useState<'all' | 'near'>('all');
  const [message, setMessage] = useState('');

  const resetAll = () => {
    setMode('all');
    setMessage('');
    window.dispatchEvent(new CustomEvent('turni-map-update', { detail: { points: allPoints } }));
    document.querySelectorAll('.pharmacy-card').forEach((el) => el.classList.remove('hidden'));
    document.querySelectorAll('.near-me-distance').forEach((el) => {
      el.textContent = '';
      el.classList.add('hidden');
    });
  };

  const applyNearMe = (userLat: number, userLng: number) => {
    const { ranked, radiusKm, extended } = rankPointsWithExtendedSearch(
      allPoints,
      userLat,
      userLng,
      { maxResults: 10 },
    );

    setMode('near');
    if (ranked.length === 0) {
      setMessage(
        `Nessuna farmacia aperta entro ${NEAR_ME_EXTENDED_MAX_KM} km. Prova la pagina provincia o riprova più tardi.`,
      );
      window.dispatchEvent(
        new CustomEvent('turni-map-update', { detail: { points: [], user: { lat: userLat, lng: userLng } } }),
      );
      document.querySelectorAll('.pharmacy-card').forEach((el) => el.classList.add('hidden'));
      scrollToTurniMap();
      return;
    }

    const slugs = new Set(ranked.map((r) => r.slug).filter(Boolean));
    const distMap = Object.fromEntries(ranked.map((r) => [r.slug, r.km]));
    const within10 = ranked.filter((r) => r.km <= NEAR_ME_PREFERRED_KM).length;

    setMessage(
      extended
        ? `${ranked.length} farmacie entro ${formatKm(radiusKm)} km (ricerca estesa oltre ${NEAR_ME_PREFERRED_KM} km${within10 === 0 ? ', nessuna entro 10 km' : ''}).`
        : `${ranked.length} ${ranked.length === 1 ? 'farmacia' : 'farmacie'} entro ${NEAR_ME_PREFERRED_KM} km.`,
    );

    document.querySelectorAll('.pharmacy-card').forEach((el) => {
      const slug = (el as HTMLElement).dataset.slug || '';
      const show = slug && slugs.has(slug);
      el.classList.toggle('hidden', !show);
      const distEl = el.querySelector('.near-me-distance');
      if (distEl && show) {
        distEl.textContent = `Circa ${formatKm(distMap[slug])} km da te`;
        distEl.classList.remove('hidden');
      }
    });

    window.dispatchEvent(
      new CustomEvent('turni-map-update', {
        detail: { points: ranked, user: { lat: userLat, lng: userLng } },
      }),
    );
    scrollToTurniMap();
  };

  const onNearMe = () => {
    if (!navigator.geolocation) {
      setMessage('Geolocalizzazione non supportata dal browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyNearMe(pos.coords.latitude, pos.coords.longitude),
      () => setMessage('Permesso posizione negato o non disponibile.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={resetAll}
          className={`turno-filter-btn inline-flex rounded-full border px-4 py-2 text-sm font-semibold shadow-sm ${mode === 'all' ? 'is-active' : 'is-inactive'}`}
          data-ga-event="cta_filter"
          data-ga-label="aperte_ora"
        >
          Aperte ora
        </button>
        <button
          type="button"
          onClick={onNearMe}
          className={`turno-filter-btn inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${mode === 'near' ? 'is-active' : 'is-inactive'}`}
          data-ga-event="cta_near_me"
          data-ga-label="piu_vicine_a_me"
        >
          Più vicine a me
        </button>
      </div>
      {message && <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</p>}
    </div>
  );
}
