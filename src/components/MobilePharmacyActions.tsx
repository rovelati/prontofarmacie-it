import { useEffect, useState } from 'react';

interface Props {
  phoneDigits?: string;
  phoneLabel?: string;
  directionsHref?: string;
  isOpen: boolean;
}

export default function MobilePharmacyActions({ phoneDigits, phoneLabel, directionsHref, isOpen }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 320);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!phoneDigits && !directionsHref) return null;

  const callClasses = isOpen
    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'bg-amber-400 text-amber-950 hover:bg-amber-500';

  return (
    <div
      className={[
        'md:hidden fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 transition-all duration-200',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0',
      ].join(' ')}
      aria-hidden={!visible}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-2xl backdrop-blur">
        {phoneDigits ? (
          <a
            href={`tel:${phoneDigits}`}
            className={`flex-1 rounded-xl px-4 py-3 text-center text-sm font-bold shadow-sm transition-colors ${callClasses}`}
            data-ga-event="cta_call"
            data-ga-label="chiama_mobile_bar"
          >
            {phoneLabel || 'Chiama'}
          </a>
        ) : null}
        {directionsHref ? (
          <a
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-bold text-gray-900 shadow-sm transition-colors hover:bg-gray-50"
            data-ga-event="cta_directions"
            data-ga-label="direzioni_mobile_bar"
          >
            Direzioni
          </a>
        ) : null}
      </div>
    </div>
  );
}
