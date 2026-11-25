import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Category, Product, Side } from '../types';
import { KioskLanguage } from '../utils/kioskI18n';

export interface MultilingualFields {
  title_en: string;
  title_es: string;
  title_pt: string;
  description_en: string;
  description_es: string;
  description_pt: string;
  ingredients_en: string;
  ingredients_es: string;
  ingredients_pt: string;
}

export interface BulkTranslationProgress {
  completed: number;
  total: number;
  currentLabel: string;
}

/**
 * Pure 0ms synchronous helpers for the public Self-Service Kiosk.
 * Zero network / AI calls on the customer screen — works offline and switches instantly.
 */
export function getLocalizedCategoryTitle(cat: Category, lang: KioskLanguage): string {
  const direct =
    lang === 'en'
      ? cat.title_en
      : lang === 'es'
      ? cat.title_es
      : cat.title_pt;
  if (direct && direct.trim()) return direct.trim();

  const legacy = cat.translations?.[lang]?.title;
  if (legacy && legacy.trim()) return legacy.trim();

  return cat.title || '';
}

export function getLocalizedProduct(
  prod: Product,
  lang: KioskLanguage,
  localizedCategoryTitle?: string
): Product {
  const directTitle =
    lang === 'en'
      ? prod.title_en
      : lang === 'es'
      ? prod.title_es
      : prod.title_pt;

  const directDesc =
    lang === 'en'
      ? prod.description_en
      : lang === 'es'
      ? prod.description_es
      : prod.description_pt;

  const directIngredients =
    lang === 'en'
      ? prod.ingredients_en
      : lang === 'es'
      ? prod.ingredients_es
      : prod.ingredients_pt;

  const directFillings =
    lang === 'en'
      ? prod.customFillings_en
      : lang === 'es'
      ? prod.customFillings_es
      : prod.customFillings_pt;

  const legacy = prod.translations?.[lang];

  return {
    ...prod,
    title:
      (directTitle && directTitle.trim()) ||
      (legacy?.title && legacy.title.trim()) ||
      prod.title,
    description:
      (directDesc && directDesc.trim()) ||
      (legacy?.description && legacy.description.trim()) ||
      prod.description,
    ingredients:
      (directIngredients && directIngredients.trim()) ||
      prod.ingredients,
    customFillings:
      (directFillings && directFillings.trim()) ||
      prod.customFillings,
    categoryTitle: localizedCategoryTitle || prod.categoryTitle,
  };
}

/**
 * Determines whether a product actually requires the customer to make choices
 * (size/variation, fillings, exclusions, allowed sides/swaps, or custom cake)
 * before being added to the cart.
 * Plain products (with only title/price/description to read) return false so `+` adds directly to cart.
 */
export function productRequiresCustomerSelection(product: Product, sides: Side[] = []): boolean {
  const hasSizesOpt = Boolean(
    product.hasSizes !== false && Array.isArray(product.sizes) && product.sizes.length > 0
  );
  const hasFillingsOpt = Boolean(
    product.isCustomSandwich &&
      product.customFillings &&
      product.customFillings
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean).length > 0
  );
  const hasExclusionsOpt = Boolean(
    product.isMeal &&
      product.ingredients &&
      product.ingredients
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean).length > 0
  );
  const hasSidesOpt = Boolean(
    product.isMeal &&
      Array.isArray(product.allowedSides) &&
      product.allowedSides.some((id) => sides.some((s) => s.id === id))
  );
  const isCustomCakeOpt = Boolean(product.isCustomCake);

  return hasSizesOpt || hasFillingsOpt || hasExclusionsOpt || hasSidesOpt || isCustomCakeOpt;
}

export function getLocalizedSideName(side: Side, lang: KioskLanguage): string {
  const direct =
    lang === 'en'
      ? side.title_en
      : lang === 'es'
      ? side.title_es
      : side.title_pt;
  if (direct && direct.trim()) return direct.trim();

  const legacy = side.translations?.[lang]?.title;
  if (legacy && legacy.trim()) return legacy.trim();

  return side.name || '';
}

/**
 * Checks whether a Category, Product, or Side is missing any of EN / ES / PT translations.
 */
export function isCategoryPendingTranslation(cat: Category): boolean {
  if (!cat.title?.trim()) return false;
  return !(cat.title_en?.trim() && cat.title_es?.trim() && cat.title_pt?.trim());
}

export function isProductPendingTranslation(prod: Product): boolean {
  if (!prod.title?.trim()) return false;
  const missingTitle = !(prod.title_en?.trim() && prod.title_es?.trim() && prod.title_pt?.trim());
  const hasDesc = Boolean(prod.description?.trim());
  const missingDesc =
    hasDesc && !(prod.description_en?.trim() && prod.description_es?.trim() && prod.description_pt?.trim());
  const hasIng = Boolean(prod.ingredients?.trim());
  const missingIng =
    hasIng && !(prod.ingredients_en?.trim() && prod.ingredients_es?.trim() && prod.ingredients_pt?.trim());
  return missingTitle || missingDesc || missingIng;
}

export function isSidePendingTranslation(side: Side): boolean {
  if (!side.name?.trim()) return false;
  return !(side.title_en?.trim() && side.title_es?.trim() && side.title_pt?.trim());
}

export function countPendingCatalogTranslations(
  categories: Category[],
  products: Product[],
  sides: Side[]
): number {
  return (
    categories.filter(isCategoryPendingTranslation).length +
    products.filter(isProductPendingTranslation).length +
    sides.filter(isSidePendingTranslation).length
  );
}

async function translateTextViaPublicEndpoint(
  text: string,
  targetLang: 'en' | 'es' | 'pt'
): Promise<string> {
  const clean = text.trim();
  if (!clean) return '';

  // Try Google Translate public web endpoint first (CORS-enabled, no API key required)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0]
          .map((seg: any) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
          .join('')
          .trim();
        if (translated) return translated;
      }
    }
  } catch {
    // fall through to secondary public translator
  }

  // Secondary public fallback (MyMemory)
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=autodetect|${targetLang}`
    );
    if (res.ok) {
      const data = await res.json();
      const translated = String(data?.responseData?.translatedText || '').trim();
      if (translated && !translated.toUpperCase().includes('MYMEMORY WARNING')) {
        return translated;
      }
    }
  } catch {
    // ignore and return original
  }

  return clean;
}

async function translateItemsViaPublicFallback(
  items: Array<{
    id: string;
    kind: 'category' | 'product' | 'side';
    title: string;
    description?: string;
    ingredients?: string;
  }>
): Promise<{ items: Array<MultilingualFields & { id: string; kind: string }> }> {
  const translatedItems = await Promise.all(
    items.map(async (item) => {
      const title = (item.title || '').trim();
      const description = (item.description || '').trim();
      const ingredients = (item.ingredients || '').trim();

      const [
        title_en,
        title_es,
        title_pt,
        description_en,
        description_es,
        description_pt,
        ingredients_en,
        ingredients_es,
        ingredients_pt,
      ] = await Promise.all([
        translateTextViaPublicEndpoint(title, 'en'),
        translateTextViaPublicEndpoint(title, 'es'),
        translateTextViaPublicEndpoint(title, 'pt'),
        description ? translateTextViaPublicEndpoint(description, 'en') : Promise.resolve(''),
        description ? translateTextViaPublicEndpoint(description, 'es') : Promise.resolve(''),
        description ? translateTextViaPublicEndpoint(description, 'pt') : Promise.resolve(''),
        ingredients ? translateTextViaPublicEndpoint(ingredients, 'en') : Promise.resolve(''),
        ingredients ? translateTextViaPublicEndpoint(ingredients, 'es') : Promise.resolve(''),
        ingredients ? translateTextViaPublicEndpoint(ingredients, 'pt') : Promise.resolve(''),
      ]);

      return {
        id: item.id,
        kind: item.kind,
        title_en: title_en || title,
        title_es: title_es || title,
        title_pt: title_pt || title,
        description_en,
        description_es,
        description_pt,
        ingredients_en,
        ingredients_es,
        ingredients_pt,
      };
    })
  );

  return { items: translatedItems };
}

async function postTranslateMultilingual<T = any>(
  items: Array<{
    id: string;
    kind: 'category' | 'product' | 'side';
    title: string;
    description?: string;
    ingredients?: string;
  }>,
  fallbackErrorLabel: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let response: Response;
  try {
    response = await fetch('/api/translate-multilingual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ items }),
      signal: controller.signal,
    });
  } catch (networkErr) {
    clearTimeout(timeoutId);
    console.warn('[Translate] /api/translate-multilingual indisponível, usando tradutor público:', networkErr);
    return (await translateItemsViaPublicFallback(items)) as unknown as T;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();
  const trimmed = rawText.trim();

  let parsed: any = null;
  if (trimmed && (contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
  }

  // Fall back to the live Google Translate endpoint if the backend route is unavailable
  // (e.g., static/Vercel host returning 405/404/HTML, missing env var 503, or transient upstream 5xx).
  const shouldUsePublicFallback =
    response.status === 405 ||
    response.status === 404 ||
    response.status === 500 ||
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504 ||
    trimmed.startsWith('<') ||
    (!parsed && !response.ok);

  if (shouldUsePublicFallback) {
    console.warn(
      `[Translate] Backend /api/translate-multilingual retornou HTTP ${response.status}; ativando tradução alternativa.`
    );
    return (await translateItemsViaPublicFallback(items)) as unknown as T;
  }

  if (!response.ok) {
    if (parsed?.error) {
      throw new Error(String(parsed.error));
    }
    throw new Error(`Erro HTTP ${response.status} ${fallbackErrorLabel}.`);
  }

  if (!parsed) {
    return (await translateItemsViaPublicFallback(items)) as unknown as T;
  }

  return parsed as T;
}

/**
 * Admin-only helper: translates a single item (product, category, or side) into EN, ES, and PT
 * via the server-side Gemini endpoint `/api/translate-multilingual`.
 */
export async function translateSingleItemAllLanguages(input: {
  kind: 'category' | 'product' | 'side';
  title: string;
  description?: string;
  ingredients?: string;
}): Promise<MultilingualFields> {
  const data = await postTranslateMultilingual<{ items?: Array<MultilingualFields & { id: string }> }>(
    [
      {
        id: 'single',
        kind: input.kind,
        title: input.title || '',
        description: input.description || '',
        ingredients: input.ingredients || '',
      },
    ],
    'ao traduzir'
  );

  const first = data?.items?.[0];
  if (!first) {
    throw new Error('Não foi possível obter a tradução do servidor.');
  }

  return {
    title_en: first.title_en || input.title || '',
    title_es: first.title_es || input.title || '',
    title_pt: first.title_pt || input.title || '',
    description_en: first.description_en || input.description || '',
    description_es: first.description_es || input.description || '',
    description_pt: first.description_pt || input.description || '',
    ingredients_en: first.ingredients_en || input.ingredients || '',
    ingredients_es: first.ingredients_es || input.ingredients || '',
    ingredients_pt: first.ingredients_pt || input.ingredients || '',
  };
}

export interface TranslatedIntroTexts {
  introSubtitle_en: string;
  introSubtitle_es: string;
  introSubtitle_pt: string;
  introDescription_en: string;
  introDescription_es: string;
  introDescription_pt: string;
  introButtonText_en: string;
  introButtonText_es: string;
  introButtonText_pt: string;
  introBottomText_en: string;
  introBottomText_es: string;
  introBottomText_pt: string;
  slogan_en: string;
  slogan_es: string;
  slogan_pt: string;
}

/**
 * Admin-only helper: translates all custom intro screen texts + store slogan
 * into EN, ES, and PT in a single batch request via `/api/translate-multilingual`.
 */
export async function translateIntroTextsAllLanguages(input: {
  introSubtitle?: string;
  introDescription?: string;
  introButtonText?: string;
  introBottomText?: string;
  slogan?: string;
}): Promise<TranslatedIntroTexts> {
  const payloadItems: Array<{ id: string; kind: 'category'; title: string }> = [];

  if (input.introSubtitle?.trim()) {
    payloadItems.push({ id: 'introSubtitle', kind: 'category', title: input.introSubtitle.trim() });
  }
  if (input.introDescription?.trim()) {
    payloadItems.push({ id: 'introDescription', kind: 'category', title: input.introDescription.trim() });
  }
  if (input.introButtonText?.trim()) {
    payloadItems.push({ id: 'introButtonText', kind: 'category', title: input.introButtonText.trim() });
  }
  if (input.introBottomText?.trim()) {
    payloadItems.push({ id: 'introBottomText', kind: 'category', title: input.introBottomText.trim() });
  }
  if (input.slogan?.trim()) {
    payloadItems.push({ id: 'slogan', kind: 'category', title: input.slogan.trim() });
  }

  const result: TranslatedIntroTexts = {
    introSubtitle_en: input.introSubtitle || '',
    introSubtitle_es: input.introSubtitle || '',
    introSubtitle_pt: input.introSubtitle || '',
    introDescription_en: input.introDescription || '',
    introDescription_es: input.introDescription || '',
    introDescription_pt: input.introDescription || '',
    introButtonText_en: input.introButtonText || '',
    introButtonText_es: input.introButtonText || '',
    introButtonText_pt: input.introButtonText || '',
    introBottomText_en: input.introBottomText || '',
    introBottomText_es: input.introBottomText || '',
    introBottomText_pt: input.introBottomText || '',
    slogan_en: input.slogan || '',
    slogan_es: input.slogan || '',
    slogan_pt: input.slogan || '',
  };

  if (payloadItems.length === 0) {
    return result;
  }

  const data = await postTranslateMultilingual<{ items?: Array<MultilingualFields & { id: string }> }>(
    payloadItems,
    'ao traduzir textos da tela inicial'
  );
  const map = new Map((data?.items || []).map((it) => [it.id, it]));

  const sub = map.get('introSubtitle');
  if (sub) {
    result.introSubtitle_en = sub.title_en || result.introSubtitle_en;
    result.introSubtitle_es = sub.title_es || result.introSubtitle_es;
    result.introSubtitle_pt = sub.title_pt || result.introSubtitle_pt;
  }

  const desc = map.get('introDescription');
  if (desc) {
    result.introDescription_en = desc.title_en || result.introDescription_en;
    result.introDescription_es = desc.title_es || result.introDescription_es;
    result.introDescription_pt = desc.title_pt || result.introDescription_pt;
  }

  const btn = map.get('introButtonText');
  if (btn) {
    result.introButtonText_en = btn.title_en || result.introButtonText_en;
    result.introButtonText_es = btn.title_es || result.introButtonText_es;
    result.introButtonText_pt = btn.title_pt || result.introButtonText_pt;
  }

  const bot = map.get('introBottomText');
  if (bot) {
    result.introBottomText_en = bot.title_en || result.introBottomText_en;
    result.introBottomText_es = bot.title_es || result.introBottomText_es;
    result.introBottomText_pt = bot.title_pt || result.introBottomText_pt;
  }

  const slg = map.get('slogan');
  if (slg) {
    result.slogan_en = slg.title_en || result.slogan_en;
    result.slogan_es = slg.title_es || result.slogan_es;
    result.slogan_pt = slg.title_pt || result.slogan_pt;
  }

  return result;
}

export interface TranslatedMainMenuTexts {
  catalog1Title_en: string;
  catalog1Title_es: string;
  catalog1Title_pt: string;
  catalog1Desc_en: string;
  catalog1Desc_es: string;
  catalog1Desc_pt: string;
  catalog1Slogan_en: string;
  catalog1Slogan_es: string;
  catalog1Slogan_pt: string;
}

/**
 * Admin-only helper: translates main catalog title, subtitle/description, and header slogan
 * into EN, ES, and PT in a single batch request via `/api/translate-multilingual`.
 */
export async function translateMainMenuTextsAllLanguages(input: {
  catalog1Title?: string;
  catalog1Desc?: string;
  catalog1Slogan?: string;
}): Promise<TranslatedMainMenuTexts> {
  const payloadItems: Array<{ id: string; kind: 'category'; title: string }> = [];

  if (input.catalog1Title?.trim()) {
    payloadItems.push({ id: 'catalog1Title', kind: 'category', title: input.catalog1Title.trim() });
  }
  if (input.catalog1Desc?.trim()) {
    payloadItems.push({ id: 'catalog1Desc', kind: 'category', title: input.catalog1Desc.trim() });
  }
  if (input.catalog1Slogan?.trim()) {
    payloadItems.push({ id: 'catalog1Slogan', kind: 'category', title: input.catalog1Slogan.trim() });
  }

  const result: TranslatedMainMenuTexts = {
    catalog1Title_en: input.catalog1Title || '',
    catalog1Title_es: input.catalog1Title || '',
    catalog1Title_pt: input.catalog1Title || '',
    catalog1Desc_en: input.catalog1Desc || '',
    catalog1Desc_es: input.catalog1Desc || '',
    catalog1Desc_pt: input.catalog1Desc || '',
    catalog1Slogan_en: input.catalog1Slogan || '',
    catalog1Slogan_es: input.catalog1Slogan || '',
    catalog1Slogan_pt: input.catalog1Slogan || '',
  };

  if (payloadItems.length === 0) {
    return result;
  }

  const data = await postTranslateMultilingual<{ items?: Array<MultilingualFields & { id: string }> }>(
    payloadItems,
    'ao traduzir textos do cardápio principal'
  );
  const map = new Map((data?.items || []).map((it) => [it.id, it]));

  const t = map.get('catalog1Title');
  if (t) {
    result.catalog1Title_en = t.title_en || result.catalog1Title_en;
    result.catalog1Title_es = t.title_es || result.catalog1Title_es;
    result.catalog1Title_pt = t.title_pt || result.catalog1Title_pt;
  }

  const d = map.get('catalog1Desc');
  if (d) {
    result.catalog1Desc_en = d.title_en || result.catalog1Desc_en;
    result.catalog1Desc_es = d.title_es || result.catalog1Desc_es;
    result.catalog1Desc_pt = d.title_pt || result.catalog1Desc_pt;
  }

  const s = map.get('catalog1Slogan');
  if (s) {
    result.catalog1Slogan_en = s.title_en || result.catalog1Slogan_en;
    result.catalog1Slogan_es = s.title_es || result.catalog1Slogan_es;
    result.catalog1Slogan_pt = s.title_pt || result.catalog1Slogan_pt;
  }

  return result;
}

/**
 * Admin-only bulk translator: iterates through all categories, products, and sides
 * missing EN/ES/PT fields, translates them in batches via Gemini, and saves directly to Firestore.
 */
export async function translatePendingCatalogInBulk(
  categories: Category[],
  products: Product[],
  sides: Side[],
  onProgress?: (progress: BulkTranslationProgress) => void
): Promise<{ translatedCount: number; failedCount: number }> {
  type PendingWorkItem = {
    id: string;
    kind: 'category' | 'product' | 'side';
    title: string;
    description: string;
    ingredients: string;
    existing: Partial<MultilingualFields>;
  };

  const pending: PendingWorkItem[] = [];

  for (const cat of categories) {
    if (isCategoryPendingTranslation(cat)) {
      pending.push({
        id: cat.id,
        kind: 'category',
        title: cat.title.trim(),
        description: '',
        ingredients: '',
        existing: {
          title_en: cat.title_en || cat.translations?.en?.title || '',
          title_es: cat.title_es || cat.translations?.es?.title || '',
          title_pt: cat.title_pt || cat.translations?.pt?.title || '',
        },
      });
    }
  }

  for (const prod of products) {
    if (isProductPendingTranslation(prod)) {
      pending.push({
        id: prod.id,
        kind: 'product',
        title: prod.title.trim(),
        description: (prod.description || '').trim(),
        ingredients: (prod.ingredients || '').trim(),
        existing: {
          title_en: prod.title_en || prod.translations?.en?.title || '',
          title_es: prod.title_es || prod.translations?.es?.title || '',
          title_pt: prod.title_pt || prod.translations?.pt?.title || '',
          description_en: prod.description_en || prod.translations?.en?.description || '',
          description_es: prod.description_es || prod.translations?.es?.description || '',
          description_pt: prod.description_pt || prod.translations?.pt?.description || '',
          ingredients_en: prod.ingredients_en || '',
          ingredients_es: prod.ingredients_es || '',
          ingredients_pt: prod.ingredients_pt || '',
        },
      });
    }
  }

  for (const side of sides) {
    if (isSidePendingTranslation(side)) {
      pending.push({
        id: side.id,
        kind: 'side',
        title: side.name.trim(),
        description: '',
        ingredients: '',
        existing: {
          title_en: side.title_en || side.translations?.en?.title || '',
          title_es: side.title_es || side.translations?.es?.title || '',
          title_pt: side.title_pt || side.translations?.pt?.title || '',
        },
      });
    }
  }

  const total = pending.length;
  if (total === 0) {
    return { translatedCount: 0, failedCount: 0 };
  }

  const BATCH_SIZE = 8;
  let completed = 0;
  let translatedCount = 0;
  let failedCount = 0;

  onProgress?.({
    completed: 0,
    total,
    currentLabel: `Iniciando tradução de ${total} itens...`,
  });

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE);
    const lookup = new Map(chunk.map((item) => [`${item.kind}:${item.id}`, item]));

    onProgress?.({
      completed,
      total,
      currentLabel: `Traduzindo lote: ${chunk[0]?.title || ''}...`,
    });

    try {
      const data = await postTranslateMultilingual<{
        items?: Array<MultilingualFields & { id: string; kind: string }>;
      }>(
        chunk.map(({ id, kind, title, description, ingredients }) => ({
          id,
          kind,
          title,
          description,
          ingredients,
        })),
        'ao traduzir lote do cardápio'
      );

      const results = Array.isArray(data?.items) ? data.items : [];

      for (const item of results) {
        const original = lookup.get(`${item.kind}:${item.id}`);
        if (!original) continue;

        const title_en = original.existing.title_en?.trim() || item.title_en || original.title;
        const title_es = original.existing.title_es?.trim() || item.title_es || original.title;
        const title_pt = original.existing.title_pt?.trim() || item.title_pt || original.title;

        try {
          if (original.kind === 'category') {
            await setDoc(
              doc(db, 'categorias', original.id),
              {
                title_en,
                title_es,
                title_pt,
                translations: {
                  en: { title: title_en },
                  es: { title: title_es },
                  pt: { title: title_pt },
                },
              },
              { merge: true }
            );
          } else if (original.kind === 'product') {
            const description_en = original.description
              ? original.existing.description_en?.trim() || item.description_en || original.description
              : '';
            const description_es = original.description
              ? original.existing.description_es?.trim() || item.description_es || original.description
              : '';
            const description_pt = original.description
              ? original.existing.description_pt?.trim() || item.description_pt || original.description
              : '';
            const ingredients_en = original.ingredients
              ? original.existing.ingredients_en?.trim() || item.ingredients_en || original.ingredients
              : '';
            const ingredients_es = original.ingredients
              ? original.existing.ingredients_es?.trim() || item.ingredients_es || original.ingredients
              : '';
            const ingredients_pt = original.ingredients
              ? original.existing.ingredients_pt?.trim() || item.ingredients_pt || original.ingredients
              : '';

            await setDoc(
              doc(db, 'produtos', original.id),
              {
                title_en,
                title_es,
                title_pt,
                description_en,
                description_es,
                description_pt,
                ingredients_en,
                ingredients_es,
                ingredients_pt,
                translations: {
                  en: { title: title_en, description: description_en },
                  es: { title: title_es, description: description_es },
                  pt: { title: title_pt, description: description_pt },
                },
              },
              { merge: true }
            );
          } else if (original.kind === 'side') {
            await setDoc(
              doc(db, 'acompanhamentos', original.id),
              {
                title_en,
                title_es,
                title_pt,
                translations: {
                  en: { title: title_en },
                  es: { title: title_es },
                  pt: { title: title_pt },
                },
              },
              { merge: true }
            );
          }
          translatedCount++;
        } catch (fsErr) {
          console.error('[BulkTranslate] Erro ao salvar no Firestore:', original.id, fsErr);
          failedCount++;
        }

        completed++;
        onProgress?.({
          completed,
          total,
          currentLabel: `Salvo: ${original.title}`,
        });
      }
    } catch (batchErr) {
      console.error('[BulkTranslate] Erro no lote:', batchErr);
      failedCount += chunk.length;
      completed += chunk.length;
      onProgress?.({
        completed,
        total,
        currentLabel: `Erro em um lote (${completed}/${total})`,
      });
    }
  }

  return { translatedCount, failedCount };
}
