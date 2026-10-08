import fs from 'node:fs';
import path from 'node:path';
import { cached, CACHE_TTL_TURNI_MS } from '@/lib/cache';
import { getSupabase } from '@/lib/supabase';

export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  author: string;
  image?: string | null;
  link: string;
  categories: string[];
  categoryGroup: string;
  source: string;
}

const BASE_SELECT =
  'id,slug,title,excerpt,content,author,status,category_group,categories,featured_image,link,published_at,created_at,priority';

function mapRow(row: Record<string, unknown>): NewsArticle {
  const slug = String(row.slug || '');
  return {
    id: String(row.id ?? slug),
    slug,
    title: String(row.title || ''),
    excerpt: String(row.excerpt || ''),
    content: String(row.content || ''),
    date: String(row.published_at || row.created_at || new Date().toISOString()),
    author: String(row.author || 'Redazione'),
    image: (row.featured_image as string) || null,
    link: `/notizie-farmacie-e-salute/${slug}/`,
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    categoryGroup: String(row.category_group || 'Non categorizzato'),
    source: 'supabase',
  };
}

function loadCachedNewsFile(): NewsArticle[] {
  try {
    const filePath = path.join(process.cwd(), 'public/data/news.json');
    if (!fs.existsSync(filePath)) return [];
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>[];
    return (raw || []).map((row) => ({
      id: String(row.id ?? row.slug),
      slug: String(row.slug || ''),
      title: String(row.title || ''),
      excerpt: String(row.excerpt || ''),
      content: String(row.content || row.excerpt || ''),
      date: String(row.date || new Date().toISOString()),
      author: String(row.author || 'Redazione'),
      image: (row.image as string) || null,
      link: String(row.link || `/notizie-farmacie-e-salute/${row.slug}/`),
      categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
      categoryGroup: String(row.categoryGroup || 'Non categorizzato'),
      source: 'cache',
    }));
  } catch {
    return [];
  }
}

export function mergeArticles(...groups: NewsArticle[][]): NewsArticle[] {
  const merged: NewsArticle[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const article of group) {
      if (!article.slug || seen.has(article.slug)) continue;
      seen.add(article.slug);
      merged.push(article);
    }
  }
  return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function fetchNewsArticles(options?: {
  limit?: number;
  categoryGroup?: string;
}): Promise<NewsArticle[]> {
  const limit = options?.limit ?? 24;
  const cacheKey = `news:${options?.categoryGroup || 'all'}:${limit}`;

  return cached(cacheKey, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    let query = supabase
      .from('articles')
      .select(BASE_SELECT)
      .eq('status', 'publish')
      .order('priority', { ascending: true })
      .order('published_at', { ascending: false })
      .limit(limit);

    if (options?.categoryGroup && options.categoryGroup !== 'all') {
      query = query.eq('category_group', options.categoryGroup);
    }

    const { data, error } = await query;
    const supabaseArticles = error ? [] : (data || []).map((r) => mapRow(r as Record<string, unknown>));
    const fileArticles = loadCachedNewsFile();
    return mergeArticles(supabaseArticles, fileArticles).slice(0, limit);
  });
}

export async function fetchNewsArticleBySlug(slug: string): Promise<NewsArticle | null> {
  return cached(`news:slug:${slug}`, CACHE_TTL_TURNI_MS, async () => {
    const supabase = getSupabase(import.meta.env);
    const { data, error } = await supabase
      .from('articles')
      .select(BASE_SELECT)
      .eq('slug', slug)
      .eq('status', 'publish')
      .maybeSingle();

    if (!error && data) return mapRow(data as Record<string, unknown>);

    const fromFile = loadCachedNewsFile().find((a) => a.slug === slug);
    return fromFile ?? null;
  });
}

export const NEWS_CATEGORY_TABS = [
  { id: 'all', label: 'Tutte le Notizie', path: '/notizie-farmacie-e-salute/' },
  {
    id: 'Salute & Benessere',
    label: 'Salute & Benessere',
    path: '/notizie-farmacie-e-salute/categorie/salute-benessere/',
  },
  {
    id: 'Farmacie di Turno',
    label: 'Farmacie di Turno',
    path: '/notizie-farmacie-e-salute/categorie/farmacie-di-turno/',
  },
  {
    id: 'Lavoro & Carriera',
    label: 'Lavoro & Carriera',
    path: '/notizie-farmacie-e-salute/categorie/lavoro-carriera/',
  },
] as const;

export const CATEGORY_SLUG_TO_GROUP: Record<string, string> = {
  'salute-benessere': 'Salute & Benessere',
  'farmacie-di-turno': 'Farmacie di Turno',
  'lavoro-carriera': 'Lavoro & Carriera',
};
