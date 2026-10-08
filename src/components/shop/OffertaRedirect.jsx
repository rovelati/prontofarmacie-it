import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, ArrowRight } from 'lucide-react';
import BrandMark from '@/components/BrandMark';

/** Redirect /out/offer?url=... verso shop esterno. */
const OffertaRedirectPage = () => {
  const targetUrl = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('url');
  }, []);
  const [countdown, setCountdown] = useState(2);

  useEffect(() => {
    if (!targetUrl) return;

    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          window.location.href = targetUrl;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [targetUrl]);

  if (!targetUrl) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-lg border border-gray-100">
          <h1 className="text-xl font-bold text-gray-800 mb-2">Link non valido</h1>
          <p className="text-gray-600">Non è stato specificato nessun URL di destinazione.</p>
          <a href="/shops/offerte-di-oggi/" className="mt-6 inline-flex items-center text-emerald-600 font-semibold hover:text-emerald-700">
            Torna alle offerte <ArrowRight className="h-4 w-4 ml-1" />
          </a>
        </div>
      </div>
    );
  }

  let displayUrl = targetUrl;
  try {
    const u = new URL(targetUrl);
    displayUrl = u.hostname.replace('www.', '');
  } catch {
    // ignore
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-lg text-center shadow-lg border border-gray-100">
        <BrandMark size={56} className="mx-auto mb-4" />
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          ProntoFarmacie ti sta reindirizzando sull&apos;offerta
        </h1>
        <p className="text-gray-600 mb-4">
          Verrai portato su <strong>{displayUrl}</strong> tra pochi secondi.
        </p>
        <p className="text-2xl font-bold text-emerald-600 mb-6">{countdown > 0 ? countdown : '...'}</p>
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors"
        >
          Vai subito <ExternalLink className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
};

export default OffertaRedirectPage;
