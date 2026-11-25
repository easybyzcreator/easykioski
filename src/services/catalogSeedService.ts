import { db } from '../firebase';
import { collection, doc, getDoc, getDocs, limit, query, setDoc } from 'firebase/firestore';
import { Category, Insumo, Product, Settings } from '../types';
import backupCategoriasRaw from '../data/backup_categorias.json';
import backupProdutosRaw from '../data/backup_produtos.json';
import backupInsumosRaw from '../data/backup_insumos.json';

export const BACKUP_CATEGORIES: Category[] = (backupCategoriasRaw as any[]).map((c, idx) => ({
  id: c.id || `cat_${idx + 1}`,
  title: c.title || 'Category',
  order: typeof c.order === 'number' ? c.order : idx + 1,
  catalog: c.catalog || 'catalog1',
}));

export const BACKUP_PRODUCTS: Product[] = (backupProdutosRaw as any[]).map((p, idx) => ({
  ...p,
  id: p.id || `prod_${idx + 1}`,
  isActive: p.isActive !== false,
  order: typeof p.order === 'number' ? p.order : idx,
}));

export const BACKUP_INSUMOS: Insumo[] = (backupInsumosRaw as any[]).map((item, idx) => ({
  id: item.id || `insumo_${idx + 1}`,
  title: item.title || 'Supply',
  description: item.description || '',
  image: item.image || '',
  link: item.link || '',
  category: item.category || 'Ingredients',
}));

export const DEFAULT_TOTEM_SETTINGS: Settings = {
  logo: 'https://i.ibb.co/LhDKPgzj/logo-ebc-p.png',
  primaryColor: '#865d39',
  whatsappNumber: '',
  whatsappCountryCode: '+1',
  slug: 'easy-totem-ebc',
  brandName: 'Easy Kioski',
  slogan: 'Artisanal flavors crafted fresh to order.',
  whatsappClosingMessage: 'Thank you for your order!',
  backgroundImage: 'https://i.ibb.co/X0vYy7L/cakes.png',
  glassColor: 'rgba(250, 247, 242, 0.92)',
  textColor: '#000000',
  language: 'en',
  currency: 'USD',
  salesTaxRate: 7.75,
  terminalProvider: 'simulation',
  terminalApiKey: '',
  terminalDeviceId: '',
  kioskPrinterName: 'Totem_Receipt_80mm',
  kitchenPrinterName: 'Kitchen_Ticket_80mm',
  askTableOrPager: false,
  kioskInactivitySeconds: 45,
  venmoUsername: 'easykioski-demo',
  paypalMeUsername: 'easykioskidemo',
  cashAppTag: 'easykioskidemo',
  allowPayAtCounter: true,
  defaultPrepMinutes: 25,
  mobilePickupRequirePaidForKds: true,
  introEnabled: true,
  introTitle: 'Easy Kioski',
  introSubtitle: 'Artisanal Self-Service',
  introDescription: 'Explore our handcrafted menu, customize your favorites, and check out in seconds.',
  introButtonText: 'TAP TO START ORDER',
  introBottomText: 'EASY KIOSKI · SELF-SERVICE KIOSK',
  selectorEnabled: false,
  selectorTitle: 'Easy Kioski',
  selectorSubtitle: 'Choose your menu',
  catalog1Title: 'Main Menu',
  catalog1Image: 'https://i.ibb.co/LhDKPgzj/logo-ebc-p.png',
  catalog1Desc: 'Our handcrafted specialties made fresh daily.',
  catalog1Slogan: 'Crafted fresh to order with artisanal ingredients',
  catalog1Active: true,
  catalog2Title: 'Drinks & Sweets',
  catalog2Image: 'https://i.ibb.co/X0vYy7L/cakes.png',
  catalog2Desc: 'Fresh juices, specialty drinks, and desserts.',
  catalog2Slogan: 'Refreshing pairings for your order',
  catalog2Active: false,
  catalog3Title: 'Low Carb',
  catalog3Image: 'https://i.ibb.co/X0vYy7L/cakes.png',
  catalog3Desc: 'Low-carb, high-protein selections.',
  catalog3Slogan: 'Balanced nutrition and flavor',
  catalog3Active: false,
  catalog4Title: 'Chef Specials',
  catalog4Image: 'https://i.ibb.co/X0vYy7L/cakes.png',
  catalog4Desc: 'Seasonal limited-run chef creations.',
  catalog4Slogan: 'Signature limited editions',
  catalog4Active: false,
  footerButtonsEnabled: false,
  footerBtn1Enabled: false,
  footerBtn1Label: 'EVENTS',
  footerBtn1Image: '',
  footerBtn2Enabled: false,
  footerBtn2Label: 'MENTORSHIP',
  footerBtn2Image: '',
};

const stripUndefined = <T extends Record<string, any>>(obj: T): T => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
};

let seedPromise: Promise<{ seeded: boolean; categories: number; products: number; insumos: number }> | null = null;

/**
 * Automatically checks the connected Firestore instance (`app-toten-ebc`).
 * If `configuracoes/geral`, `categorias`, `produtos`, or `insumos` are empty,
 * migrates the preserved base catalog & embedded Base64 images automatically.
 */
export async function ensureInitialCatalogSeed(): Promise<{
  seeded: boolean;
  categories: number;
  products: number;
  insumos: number;
}> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    let seeded = false;
    let categoriesSeeded = 0;
    let productsSeeded = 0;
    let insumosSeeded = 0;

    try {
      // 1. Check Settings
      const settingsRef = doc(db, 'configuracoes', 'geral');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, stripUndefined(DEFAULT_TOTEM_SETTINGS));
        seeded = true;
      }

      // 2. Check Categories
      const catSnap = await getDocs(query(collection(db, 'categorias'), limit(1)));
      if (catSnap.empty && BACKUP_CATEGORIES.length > 0) {
        for (const cat of BACKUP_CATEGORIES) {
          const { id, ...catData } = cat;
          await setDoc(doc(db, 'categorias', id), stripUndefined(catData));
          categoriesSeeded++;
        }
        seeded = true;
      }

      // 3. Check Products (preserves every product & Base64 photo)
      const prodSnap = await getDocs(query(collection(db, 'produtos'), limit(1)));
      if (prodSnap.empty && BACKUP_PRODUCTS.length > 0) {
        for (const prod of BACKUP_PRODUCTS) {
          const { id, ...prodData } = prod;
          await setDoc(doc(db, 'produtos', id), stripUndefined(prodData));
          productsSeeded++;
        }
        seeded = true;
      }

      // 4. Check Insumos
      const insumosSnap = await getDocs(query(collection(db, 'insumos'), limit(1)));
      if (insumosSnap.empty && BACKUP_INSUMOS.length > 0) {
        for (const ins of BACKUP_INSUMOS) {
          const { id, ...insData } = ins;
          await setDoc(doc(db, 'insumos', id), stripUndefined(insData));
          insumosSeeded++;
        }
        seeded = true;
      }

      if (seeded) {
        console.log(
          `[EasyTotem Seed] Auto-populated Firestore: ${categoriesSeeded} categories, ${productsSeeded} products, ${insumosSeeded} supplies.`
        );
      }
    } catch (err) {
      console.warn('[EasyTotem Seed] Automatic seed encountered an error (fallback active):', err);
    }

    return { seeded, categories: categoriesSeeded, products: productsSeeded, insumos: insumosSeeded };
  })();

  return seedPromise;
}

/**
 * Manual Admin action to import/restore the entire preserved base catalog
 * (categories, products with images, and supplies) to Firestore at any time.
 */
export async function restoreBaseCatalogToFirestore(): Promise<{
  categoriesCount: number;
  productsCount: number;
  insumosCount: number;
}> {
  let categoriesCount = 0;
  let productsCount = 0;
  let insumosCount = 0;

  for (const cat of BACKUP_CATEGORIES) {
    const { id, ...catData } = cat;
    await setDoc(doc(db, 'categorias', id), stripUndefined(catData), { merge: true });
    categoriesCount++;
  }

  for (const prod of BACKUP_PRODUCTS) {
    const { id, ...prodData } = prod;
    await setDoc(doc(db, 'produtos', id), stripUndefined(prodData), { merge: true });
    productsCount++;
  }

  for (const ins of BACKUP_INSUMOS) {
    const { id, ...insData } = ins;
    await setDoc(doc(db, 'insumos', id), stripUndefined(insData), { merge: true });
    insumosCount++;
  }

  return { categoriesCount, productsCount, insumosCount };
}
