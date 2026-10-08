import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  Tag,
  ChevronLeft,
  Loader2,
  ShoppingBag,
} from 'lucide-react';

// Slug -> nome categoria (da offer_categories)
const CATEGORY_NAMES = {
  integratori: 'Integratori',
  dimagranti: 'Dimagranti e Controllo Peso',
  vitamine: 'Vitamine e Minerali',
  dermatologici: 'Dermatologici e Cura Pelle',
  probiotici: 'Probiotici e Fermenti',
  omeopatici: 'Omeopatici e Fitoterapici',
  igiene: 'Igiene e Cura Personale',
  altro: 'Altro',
};

// Ordine categorie per nav
const CATEGORY_ORDER = ['integratori', 'dimagranti', 'vitamine', 'dermatologici', 'probiotici', 'omeopatici', 'igiene', 'altro'];

const getTodayRomeIsoDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const OfferteDiOggiPage = ({
  categorySlug = undefined,
  shopSlug = undefined,
  shopName = undefined,
  backHref = '/shop/elenco-dei-migliori-ecommerce-del-farmaco-trova-link-promo-sconti/',
  backLabel = 'Elenco shop',
  initialOffers = undefined,
  initialCategories = undefined,
  initialOfferDate = undefined,
}) => {
  const today = initialOfferDate || getTodayRomeIsoDate();
  const hasInitialOffers = Array.isArray(initialOffers);
  const [offers, setOffers] = useState(hasInitialOffers ? initialOffers : []);
  const [categories, setCategories] = useState(Array.isArray(initialCategories) ? initialCategories : []);
  const [loading, setLoading] = useState(!hasInitialOffers);

  useEffect(() => {
    if (hasInitialOffers && initialOfferDate === today) return;

    const fetchOffers = async () => {
      setLoading(true);
      try {
        const { supabase } = await import('@/lib/supabaseClient.ts');
        let query = supabase
          .from('shop_offers')
          .select('*')
          .eq('offer_date', today)
          .order('discount_pct', { ascending: false, nullsFirst: false })
          .order('price_offered', { ascending: true });

        if (categorySlug && categorySlug !== 'tutte') {
          query = query.eq('category_slug', categorySlug);
        }

        if (shopSlug) {
          query = query.eq('shop_slug', shopSlug);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Errore fetch offerte:', error);
          setOffers([]);
        } else {
          setOffers(data || []);
        }

        // Categorie con almeno un'offerta oggi
        let catQuery = supabase
          .from('shop_offers')
          .select('category_slug')
          .eq('offer_date', today);

        if (shopSlug) {
          catQuery = catQuery.eq('shop_slug', shopSlug);
        }

        const { data: catData } = await catQuery;

        const slugs = [...new Set((catData || []).map((r) => r.category_slug).filter(Boolean))];
        setCategories(
          CATEGORY_ORDER.filter((s) => slugs.includes(s)).concat(slugs.filter((s) => !CATEGORY_ORDER.includes(s)))
        );
      } finally {
        setLoading(false);
      }
    };
    fetchOffers();
  }, [categorySlug, hasInitialOffers, initialOfferDate, shopSlug, today]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.prontofarmacie.it';
  const basePath = '/shops/offerte-di-oggi/';
  const currentPath = shopSlug
    ? `/shop/${shopSlug}/offerte-odierne/`
    : (categorySlug ? `${basePath}${categorySlug}/` : basePath);
  const canonicalUrl = `${origin}${currentPath}`;
  const categoryName = categorySlug ? CATEGORY_NAMES[categorySlug] || categorySlug : null;
  const pageTitle = shopName
    ? `Offerte odierne ${shopName} | ProntoFarmacie`
    : categoryName
    ? `Offerte di Oggi - ${categoryName} | ProntoFarmacie`
    : 'Offerte di Oggi - Comparatore E-commerce Farmacia | ProntoFarmacie';
  const pageDescription = shopName
    ? `Promozioni e sconti del giorno su ${shopName}.`
    : categoryName
    ? `Confronta le migliori offerte ${categoryName.toLowerCase()} oggi disponibili sugli e-commerce del farmaco. Trova gli sconti aggiornati quotidianamente.`
    : 'Confronta le offerte del giorno degli e-commerce farmaceutici. Sconti aggiornati quotidianamente su Atida eFarma, Redcare, Dr. Max e altri.';

  // ItemList + Product per SEO
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: pageTitle,
    description: pageDescription,
    url: canonicalUrl,
    numberOfItems: offers.length,
    itemListElement: offers.slice(0, 20).map((o, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: o.product_name,
        url: o.product_url,
        image: o.image_url,
        offers: {
          '@type': 'Offer',
          price: o.price_offered,
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
        },
      },
    })),
  };

  return (
    <div className="bg-gray-50 min-h-screen pb-12">

      <section className="bg-white border-b py-10 px-4 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <a
            href={backHref}
            className="inline-flex items-center text-sm font-semibold text-green-600 hover:text-green-700 mb-6"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> {backLabel}
          </a>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-2">
                {shopName ? `Offerte odierne - ${shopName}` : `Offerte di Oggi ${categoryName ? `- ${categoryName}` : ''}`}
              </h1>
              <p className="text-gray-600">
                Sconti aggiornati quotidianamente dagli e-commerce del farmaco
              </p>
            </div>
            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-xl">
              <ShoppingBag className="h-5 w-5" />
              <span className="font-semibold">{offers.length} offerte</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filtro categorie */}
      {!shopSlug && categories.length > 1 && (
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <a
              href={basePath}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                !categorySlug ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Tutte
            </a>
            {categories.map((slug) => (
              <a
                key={slug}
                href={`${basePath}${slug}/`}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  categorySlug === slug ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {CATEGORY_NAMES[slug] || slug}
              </a>
            ))}
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-green-600" />
          </div>
        ) : offers.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <ShoppingBag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-700 mb-2">Nessuna offerta disponibile</h2>
            <p className="text-gray-500">
              Le offerte vengono aggiornate ogni giorno. Torna domani o consulta direttamente le pagine promo degli
              shop.
            </p>
            <a
              href="/shop/elenco-dei-migliori-ecommerce-del-farmaco-trova-link-promo-sconti/"
              className="inline-flex items-center mt-4 text-green-600 font-semibold hover:text-green-700"
            >
              Vai all&apos;elenco shop <ExternalLink className="h-4 w-4 ml-1" />
            </a>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {offers.map((offer) => (
              <OfferCard key={`${offer.shop_slug}-${offer.product_url}`} offer={offer} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

// Redcare CDN: richiedi risoluzione 400px e referrerPolicy per evitare blocchi hotlink
const imageUrlForDisplay = (url) => {
  if (!url) return null;
  if (url.includes('cdn.redcare.it') && !url.includes('?')) return `${url}?w=400`;
  return url;
};

const OfferCard = ({ offer }) => {
  const redirectUrl = `/out/offer?url=${encodeURIComponent(offer.product_url)}`;
  const imgSrc = imageUrlForDisplay(offer.image_url) || offer.image_url;

  return (
    <a
      href={redirectUrl}
      className="block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg hover:border-green-200 transition-all group"
    >
      <div className="aspect-square bg-gray-50 relative overflow-hidden">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={offer.product_name}
            className="w-full h-full object-contain p-4"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <ShoppingBag className="h-20 w-20" />
          </div>
        )}
        {offer.discount_pct != null && (
          <div className="absolute top-3 right-3 bg-red-500 text-white font-bold px-3 py-1 rounded-lg text-sm shadow">
            -{offer.discount_pct}%
          </div>
        )}
      </div>
      <div className="p-4">
        <span className="text-xs font-medium text-green-600 uppercase tracking-wide">{offer.shop_name}</span>
        <h3 className="font-bold text-gray-900 mt-1 line-clamp-2 group-hover:text-green-700">
          {offer.product_name}
        </h3>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-green-600">{offer.price_offered?.toFixed(2)} €</span>
            {offer.price_original != null && (
              <span className="text-sm text-gray-400 line-through">{offer.price_original?.toFixed(2)} €</span>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center text-sm text-gray-500">
          <Tag className="h-4 w-4 mr-1 text-gray-400" />
          {CATEGORY_NAMES[offer.category_slug] || offer.category_slug}
        </div>
        <div className="mt-3 flex items-center text-green-600 font-semibold text-sm">
          Vai all&apos;offerta <ExternalLink className="h-4 w-4 ml-1" />
        </div>
      </div>
    </a>
  );
};

export default OfferteDiOggiPage;
