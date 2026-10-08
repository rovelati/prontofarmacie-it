import { useEffect, useState } from 'react';

interface Props {
  targetPath?: string;
  hash?: string;
  buttonLabel?: string;
  loadingLabel?: string;
  buttonClassName?: string;
  errorClassName?: string;
  /** Avvia subito la geolocalizzazione al mount (es. ?near=1). */
  autoStart?: boolean;
}

export default function GeoNearMeButton({
  targetPath = '/farmacie-di-turno/',
  hash = 'turni-map',
  buttonLabel = 'Apri mappa vicino a me',
  loadingLabel = 'Sto localizzando...',
  buttonClassName = 'inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow hover:bg-white/95 disabled:opacity-70',
  errorClassName = 'mt-3 inline-block rounded-lg bg-black/20 px-4 py-2 text-sm text-white',
  autoStart = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const locate = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Geolocalizzazione non disponibile nel browser.');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const params = new URLSearchParams({
          lat: latitude.toFixed(6),
          lng: longitude.toFixed(6),
        });
        const suffix = hash ? `#${hash.replace(/^#/, '')}` : '';
        window.location.href = `${targetPath}?${params.toString()}${suffix}`;
      },
      () => {
        setLoading(false);
        setError('Non abbiamo ottenuto la posizione. Controlla i permessi del browser.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };

  useEffect(() => {
    if (autoStart) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al mount
  }, [autoStart]);

  return (
    <div>
      <button type="button" onClick={locate} disabled={loading} className={buttonClassName} data-ga-event="cta_near_me" data-ga-label={buttonLabel}>
        {loading ? loadingLabel : buttonLabel}
      </button>
      {error && <p className={errorClassName}>{error}</p>}
    </div>
  );
}
