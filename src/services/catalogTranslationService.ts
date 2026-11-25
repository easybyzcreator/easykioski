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
    categoryTitle: localizedCategoryTitle || prod.categoryTitle,
  };
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
  const response = await fetch('/api/translate-multilingual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          id: 'single',
          kind: input.kind,
          title: input.title || '',
          description: input.description || '',
          ingredients: input.ingredients || '',
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody?.error || `Erro HTTP ${response.status} ao traduzir.`);
  }

  const data = (await response.json()) as { items?: Array<MultilingualFields & { id: string }> };
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
      const response = await fetch('/api/translate-multilingual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: chunk.map(({ id, kind, title, description, ingredients }) => ({
            id,
            kind,
            title,
            description,
            ingredients,
          })),
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.error || `Erro HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        items?: Array<MultilingualFields & { id: string; kind: string }>;
      };

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
