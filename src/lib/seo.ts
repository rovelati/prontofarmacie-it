import { siteUrl } from '@/lib/turni';

export interface SeoArticle {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author?: string | null;
  image?: string | null;
}

export interface SeoProps {
  title: string;
  description: string;
  canonical: string;
  jsonLd?: Record<string, unknown>[];
}

export const ORGANIZATION_DESCRIPTION =
  'Portale italiano per farmacie di turno, farmacie aperte ora, schede con orari e telefono, e offerte di lavoro in farmacia.';

/** Profili già usati nel knowledge graph React. */
export const SAME_AS_PROFILES = [
  'https://www.facebook.com/prontofarmacie',
  'https://twitter.com/prontofarmacie',
  'https://www.instagram.com/prontofarmacie',
  'https://www.linkedin.com/company/prontofarmacie/',
];

export function organizationId(base: string): string {
  return `${base.replace(/\/$/, '')}/#organization`;
}

export function websiteId(base: string): string {
  return `${base.replace(/\/$/, '')}/#website`;
}

export function logoUrl(base: string): string {
  return `${base.replace(/\/$/, '')}/android-chrome-512x512.png`;
}

export function buildOrganizationJsonLd(base: string) {
  const origin = base.replace(/\/$/, '');
  const orgId = organizationId(origin);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': orgId,
    name: 'ProntoFarmacie',
    alternateName: ['Pronto Farmacie', 'ProntoFarmacie.it'],
    url: `${origin}/`,
    logo: {
      '@type': 'ImageObject',
      url: logoUrl(origin),
      width: 512,
      height: 512,
    },
    image: [logoUrl(origin)],
    description: ORGANIZATION_DESCRIPTION,
    email: 'marketing@prontofarmacie.it',
    sameAs: SAME_AS_PROFILES,
    knowsAbout: [
      'Farmacie di turno',
      'Farmacia aperta ora',
      'Orari farmacie',
      'Lavoro in farmacia',
      'Salute pubblica',
    ],
    areaServed: { '@type': 'Country', name: 'Italia' },
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'marketing@prontofarmacie.it',
      contactType: 'customer support',
      availableLanguage: ['Italian'],
    },
  };
}

export function buildWebSiteJsonLd(base: string) {
  const origin = base.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': websiteId(origin),
    name: 'ProntoFarmacie',
    url: `${origin}/`,
    description:
      'Trova farmacie di turno, farmacie aperte ora e offerte di lavoro nelle farmacie italiane.',
    inLanguage: 'it-IT',
    publisher: { '@id': organizationId(origin) },
    about: { '@id': organizationId(origin) },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${origin}/listafarmacie/cerca?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Organization + WebSite da iniettare su ogni pagina pubblica. */
export function buildSiteGraphJsonLd(env: ImportMetaEnv = import.meta.env) {
  const base = siteUrl(env);
  return [buildOrganizationJsonLd(base), buildWebSiteJsonLd(base)];
}

export function buildNewsArticleJsonLd(base: string, article: SeoArticle) {
  const origin = base.replace(/\/$/, '');
  const pageUrl = `${origin}/notizie-farmacie-e-salute/${article.slug}/`;
  const authorName = (article.author || 'Redazione').trim();
  const isBrandAuthor = /redazione|pronto\s*farmacie/i.test(authorName);
  const published = article.date || new Date().toISOString();

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${pageUrl}#article`,
    headline: article.title,
    description: article.excerpt.replace(/[#*<>\\/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
    datePublished: published,
    dateModified: published,
    url: pageUrl,
    inLanguage: 'it-IT',
    author: isBrandAuthor
      ? { '@type': 'Organization', name: 'ProntoFarmacie', '@id': organizationId(origin) }
      : { '@type': 'Person', name: authorName },
    publisher: { '@id': organizationId(origin) },
    isPartOf: { '@id': websiteId(origin) },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
    },
  };

  if (article.image) schema.image = [article.image];
  return schema;
}

export function buildNewsCollectionJsonLd(
  base: string,
  pageUrl: string,
  name: string,
  description: string,
  articles: SeoArticle[],
) {
  const origin = base.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name,
    description,
    inLanguage: 'it-IT',
    isPartOf: { '@id': websiteId(origin) },
    publisher: { '@id': organizationId(origin) },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: articles.length,
      itemListElement: articles.slice(0, 12).map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${origin}/notizie-farmacie-e-salute/${article.slug}/`,
        name: article.title,
      })),
    },
  };
}

export function buildContactPageJsonLd(base: string, pageUrl: string) {
  const origin = base.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    url: pageUrl,
    name: 'Contatti ProntoFarmacie',
    description: 'Richiedi aggiornamento o correzione della scheda farmacia su ProntoFarmacie.it.',
    inLanguage: 'it-IT',
    isPartOf: { '@id': websiteId(origin) },
    about: { '@id': organizationId(origin) },
    mainEntity: {
      '@type': 'ContactPoint',
      email: 'marketing@prontofarmacie.it',
      contactType: 'customer support',
      availableLanguage: ['Italian'],
    },
  };
}

export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildFaqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function buildMedicalWebPageJsonLd(params: {
  url: string;
  name: string;
  description: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    url: params.url,
    name: params.name,
    description: params.description,
    inLanguage: 'it-IT',
  };
}
