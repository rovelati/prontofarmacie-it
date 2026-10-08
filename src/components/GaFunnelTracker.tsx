import { useEffect } from 'react';
import { detectPageType, trackGaEvent } from '@/lib/analytics';

const SCROLL_MARKS = [25, 50, 75, 90] as const;

function engagementTimeMs(): number {
  const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
  const start = nav?.startTime ?? 0;
  return Math.max(0, Math.round(performance.now() - start));
}

function scrollPercent(): number {
  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
  const height = Math.max(doc.scrollHeight, body.scrollHeight) - window.innerHeight;
  if (height <= 0) return 100;
  return Math.min(100, Math.round((scrollTop / height) * 100));
}

function inferCtaFromAnchor(anchor: HTMLAnchorElement): { event: string; label: string } | null {
  const explicit = anchor.getAttribute('data-ga-event');
  if (explicit) {
    return {
      event: explicit,
      label: anchor.getAttribute('data-ga-label') || anchor.textContent?.trim().slice(0, 80) || explicit,
    };
  }

  const href = (anchor.getAttribute('href') || '').trim();
  const text = (anchor.textContent || '').trim().toLowerCase();
  const hrefLower = href.toLowerCase();

  if (hrefLower.startsWith('tel:')) {
    return { event: 'cta_call', label: text || 'chiama' };
  }
  if (
    hrefLower.includes('google.com/maps') ||
    hrefLower.includes('maps.apple.com') ||
    hrefLower.includes('/maps/dir') ||
    text.includes('direzioni') ||
    text.includes('indicazioni')
  ) {
    return { event: 'cta_directions', label: text || 'direzioni' };
  }
  if (
    hrefLower.includes('near=1') ||
    hrefLower.includes('vicino-a-te') ||
    text.includes('vicino a me') ||
    text.includes('più vicine')
  ) {
    return { event: 'cta_near_me', label: text || 'vicino_a_me' };
  }
  if (hrefLower.includes('/farmacie-di-turno/cerca') || hrefLower.includes('/listafarmacie/cerca') || text === 'cerca' || text.includes('cerca località')) {
    return { event: 'cta_search', label: text || 'cerca' };
  }
  if (hrefLower.includes('/farmacia/') && !hrefLower.includes('/farmacie-di-turno')) {
    return { event: 'cta_pharmacy_detail', label: text.slice(0, 80) || 'scheda_farmacia' };
  }
  if (hrefLower.includes('/farmacie-di-turno')) {
    return { event: 'cta_turni_nav', label: text.slice(0, 80) || 'turni' };
  }
  if (hrefLower.includes('/lavoro')) {
    return { event: 'cta_lavoro_nav', label: text.slice(0, 80) || 'lavoro' };
  }
  return null;
}

/**
 * Funnel GA4: atterraggio (page_view già in head) → scroll → CTA.
 * Eventi custom per Explore / funnel pathing.
 */
export default function GaFunnelTracker() {
  useEffect(() => {
    const pageType = detectPageType();
    const path = window.location.pathname + window.location.search;

    trackGaEvent('funnel_land', {
      page_type: pageType,
      page_path: path,
      engagement_time_msec: 0,
    });

    const seenScroll = new Set<number>();
    const onScroll = () => {
      const pct = scrollPercent();
      for (const mark of SCROLL_MARKS) {
        if (pct >= mark && !seenScroll.has(mark)) {
          seenScroll.add(mark);
          trackGaEvent('funnel_scroll', {
            page_type: pageType,
            page_path: path,
            percent_scrolled: mark,
            engagement_time_msec: engagementTimeMs(),
          });
        }
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest) return;

      const button = target.closest('button[data-ga-event]') as HTMLButtonElement | null;
      if (button) {
        const name = button.getAttribute('data-ga-event') || 'cta_click';
        const label = button.getAttribute('data-ga-label') || button.textContent?.trim().slice(0, 80) || name;
        trackGaEvent(name, {
          page_type: pageType,
          page_path: path,
          cta_label: label,
          engagement_time_msec: engagementTimeMs(),
        });
        trackGaEvent('funnel_cta', {
          page_type: pageType,
          page_path: path,
          cta_type: name,
          cta_label: label,
          engagement_time_msec: engagementTimeMs(),
        });
        return;
      }

      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const inferred = inferCtaFromAnchor(anchor);
      if (!inferred) return;

      const pharmacySlug =
        anchor.getAttribute('data-ga-pharmacy') ||
        anchor.closest('[data-slug]')?.getAttribute('data-slug') ||
        undefined;

      trackGaEvent(inferred.event, {
        page_type: pageType,
        page_path: path,
        cta_label: inferred.label,
        link_url: (anchor.getAttribute('href') || '').slice(0, 300),
        pharmacy_slug: pharmacySlug,
        engagement_time_msec: engagementTimeMs(),
      });

      // Step funnel aggregato per Explore
      trackGaEvent('funnel_cta', {
        page_type: pageType,
        page_path: path,
        cta_type: inferred.event,
        cta_label: inferred.label,
        engagement_time_msec: engagementTimeMs(),
      });
    };

    document.addEventListener('click', onClick, true);

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
