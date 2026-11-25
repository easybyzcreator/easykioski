import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Category, Product, Settings } from '../types';
import {
  Calculator,
  Plus,
  Trash2,
  Save,
  Search,
  Sparkles,
  CheckCircle2,
  CreditCard,
  Smartphone,
  Edit2,
  X,
  BookOpen,
  RotateCcw,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getCurrencySymbol } from '../utils/countryUtils';

export type IngredientUnit = 'g' | 'kg' | 'ml' | 'L' | 'un';

export interface BaseIngredient {
  id: string;
  name: string;
  packageQty: number;
  unit: IngredientUnit;
  packagePrice: number;
}

export interface RecipeIngredientLine {
  id: string;
  baseIngredientId?: string;
  name: string;
  packageQty: number;
  packageUnit: IngredientUnit;
  packagePrice: number;
  usedQty: number;
  usedUnit: 'g' | 'ml' | 'un';
}

export type PaymentMethodKey = 'zero_fee' | 'debit' | 'credit' | 'paypal';

export interface SavedPricingRecipe {
  id: string;
  productId?: string;
  productName: string;
  category?: string;
  yieldQty: number;
  unitType?: string;
  // New intuitive model fields
  recipeIngredients?: RecipeIngredientLine[];
  kitchenCostPercent?: number;
  laborFixedCost?: number;
  profitPercent?: number;
  paymentMethod?: PaymentMethodKey;
  // Backwards-compatible summary fields
  ingredients?: any[];
  packagingCost?: number;
  totalDirectCost?: number;
  suggestedPrice?: number;
  unitSuggestedPrice?: number;
  cleanProfit?: number;
  updatedAt?: any;
}

interface PricingAdminProps {
  settings: Settings;
  products: Product[];
  categories?: Category[];
}

const KITCHEN_COST_PRESETS = [
  { label: 'Sem extra (0%)', value: 0 },
  { label: 'Baixo (+10%)', value: 10 },
  { label: 'Padrão (+15%)', value: 15 },
  { label: 'Forno longo (+20%)', value: 20 },
];

const PROFIT_PRESETS = [
  { label: '+50%', sublabel: '', value: 50 },
  { label: '+100%', sublabel: '(Dobro)', value: 100 },
  { label: '+150%', sublabel: '', value: 150 },
  { label: '+200%', sublabel: '(3x)', value: 200 },
];

const PAYMENT_METHODS: Array<{
  key: PaymentMethodKey;
  title: string;
  subtitle: string;
  percentFee: number;
  fixedFee: number;
  icon: 'phone' | 'card';
}> = [
  {
    key: 'zero_fee',
    title: 'Zelle / Venmo / Dinheiro',
    subtitle: 'Sem taxa ($0)',
    percentFee: 0,
    fixedFee: 0,
    icon: 'phone',
  },
  {
    key: 'debit',
    title: 'Cartão de Débito',
    subtitle: 'Com taxa da maquininha',
    percentFee: 1.75,
    fixedFee: 0.1,
    icon: 'card',
  },
  {
    key: 'credit',
    title: 'Cartão de Crédito',
    subtitle: 'Com taxa da maquininha',
    percentFee: 2.9,
    fixedFee: 0.3,
    icon: 'card',
  },
  {
    key: 'paypal',
    title: 'PayPal',
    subtitle: 'Com taxa do PayPal',
    percentFee: 3.49,
    fixedFee: 0.49,
    icon: 'card',
  },
];

const UNIT_TYPE_OPTIONS = [
  'unidade(s)',
  'porção(ões)',
  'pote(s)',
  'fatia(s)',
  'caixa(s)',
  'copo(s)',
  'kg',
];

const DEFAULT_CATEGORIES = [
  'Açaí & Bowls',
  'Bolos',
  'Doces',
  'Salgados',
  'Bebidas',
  'Refeições',
  'Combos',
  'Outros',
];

const STARTER_BASE_INGREDIENTS: BaseIngredient[] = [
  { id: 'ing_acai', name: 'Polpa / Creme de Açaí', packageQty: 1000, unit: 'g', packagePrice: 12.5 },
  { id: 'ing_granola', name: 'Granola Artesanal', packageQty: 500, unit: 'g', packagePrice: 5.5 },
  { id: 'ing_leite_cond', name: 'Leite Condensado', packageQty: 395, unit: 'g', packagePrice: 2.4 },
  { id: 'ing_leite_po', name: 'Leite em Pó (Ninho)', packageQty: 400, unit: 'g', packagePrice: 6.9 },
  { id: 'ing_morango', name: 'Morango Fresco', packageQty: 450, unit: 'g', packagePrice: 4.5 },
  { id: 'ing_banana', name: 'Banana', packageQty: 1000, unit: 'g', packagePrice: 1.6 },
  { id: 'ing_nutella', name: 'Creme de Avelã (Nutella)', packageQty: 750, unit: 'g', packagePrice: 8.9 },
  { id: 'ing_farinha', name: 'Farinha de Trigo', packageQty: 1000, unit: 'g', packagePrice: 2.5 },
  { id: 'ing_acucar', name: 'Açúcar Refinado', packageQty: 1000, unit: 'g', packagePrice: 2.8 },
  { id: 'ing_queijo', name: 'Queijo Mussarela', packageQty: 1000, unit: 'g', packagePrice: 9.5 },
  { id: 'ing_embalagem_bowl', name: 'Embalagem / Bowl com Tampa', packageQty: 50, unit: 'un', packagePrice: 18.0 },
  { id: 'ing_colher_guardanapo', name: 'Colher + Guardanapo', packageQty: 100, unit: 'un', packagePrice: 6.5 },
];

const LOCAL_INGREDIENTS_KEY = 'easy_kioski_base_ingredients_v1';

const getContrastText = (hexColor?: string): string => {
  if (!hexColor) return '#ffffff';
  let hex = hexColor.trim().replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const hsp = Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
  return hsp > 160 ? '#111827' : '#ffffff';
};

function getRecipeUsedUnit(packageUnit: IngredientUnit): 'g' | 'ml' | 'un' {
  if (packageUnit === 'kg' || packageUnit === 'g') return 'g';
  if (packageUnit === 'L' || packageUnit === 'ml') return 'ml';
  return 'un';
}

function getPackageBaseQty(packageQty: number, packageUnit: IngredientUnit): number {
  const safeQty = Number(packageQty) || 0;
  if (packageUnit === 'kg' || packageUnit === 'L') return safeQty * 1000;
  return safeQty;
}

function computeLineCost(line: RecipeIngredientLine): number {
  const baseQty = getPackageBaseQty(line.packageQty, line.packageUnit);
  if (baseQty <= 0) return 0;
  return ((Number(line.usedQty) || 0) / baseQty) * (Number(line.packagePrice) || 0);
}

export const PricingAdmin: React.FC<PricingAdminProps> = ({
  settings,
  products,
  categories = [],
}) => {
  const currencySymbol = getCurrencySymbol(settings?.currency || 'USD');
  const accentColor = settings?.primaryColor || '#5e1742';
  const accentText = getContrastText(accentColor);

  const [activeSubTab, setActiveSubTab] = useState<'calculator' | 'saved'>('calculator');
  const [savedRecipes, setSavedRecipes] = useState<SavedPricingRecipe[]>([]);
  const [baseIngredients, setBaseIngredients] = useState<BaseIngredient[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_INGREDIENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore localStorage read errors
    }
    return [];
  });

  // Step 1: Recipe info
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [recipeName, setRecipeName] = useState<string>('');
  const [recipeCategory, setRecipeCategory] = useState<string>('');
  const [yieldQty, setYieldQty] = useState<number>(1);
  const [unitType, setUnitType] = useState<string>('unidade(s)');

  // Step 2: Ingredients + Kitchen costs + Labor
  const [ingredientSearch, setIngredientSearch] = useState<string>('');
  const [recipeLines, setRecipeLines] = useState<RecipeIngredientLine[]>([]);
  const [kitchenCostPercent, setKitchenCostPercent] = useState<number>(15);
  const [laborFixedCost, setLaborFixedCost] = useState<string>('');

  // Step 3: Profit & Payment Fees
  const [profitPercent, setProfitPercent] = useState<number>(100);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodKey>('zero_fee');

  // New / Edit Base Ingredient Modal
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [editingBaseIngId, setEditingBaseIngId] = useState<string | null>(null);
  const [ingModalName, setIngModalName] = useState('');
  const [ingModalQty, setIngModalQty] = useState('1000');
  const [ingModalUnit, setIngModalUnit] = useState<IngredientUnit>('g');
  const [ingModalPrice, setIngModalPrice] = useState('');

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [isApplyingToProduct, setIsApplyingToProduct] = useState(false);

  const formatMoney = (val: number) => `${currencySymbol} ${Number(val || 0).toFixed(2)}`;

  // Category dropdown options combining real store categories + fallback presets
  const categoryOptions = useMemo(() => {
    const names = categories
      .map((c) => (c.title || '').trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...names, ...DEFAULT_CATEGORIES]));
    return merged;
  }, [categories]);

  useEffect(() => {
    if (!recipeCategory && categoryOptions.length > 0) {
      setRecipeCategory(categoryOptions[0]);
    }
  }, [categoryOptions, recipeCategory]);

  // Listen to saved recipes in Firestore (`fichas_tecnicas`)
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, 'fichas_tecnicas'), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as SavedPricingRecipe[];
      list.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
      setSavedRecipes(list);
    });
    return () => unsub();
  }, []);

  // Listen to base ingredients in Firestore (`configuracoes/precificacao_ingredientes`)
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, 'configuracoes', 'precificacao_ingredientes'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.items)) {
            setBaseIngredients(data.items as BaseIngredient[]);
            try {
              localStorage.setItem(LOCAL_INGREDIENTS_KEY, JSON.stringify(data.items));
            } catch {
              // ignore quota errors
            }
          }
        }
      },
      (err) => {
        console.warn('[PricingAdmin] Ingredientes fallback local:', err);
      }
    );
    return () => unsub();
  }, []);

  const persistBaseIngredients = async (nextList: BaseIngredient[]) => {
    setBaseIngredients(nextList);
    try {
      localStorage.setItem(LOCAL_INGREDIENTS_KEY, JSON.stringify(nextList));
    } catch {
      // ignore localStorage error
    }
    if (db) {
      try {
        await setDoc(
          doc(db, 'configuracoes', 'precificacao_ingredientes'),
          {
            items: nextList,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Erro ao salvar ingredientes no Firestore:', err);
      }
    }
  };

  // Filtered base ingredients for search box
  const filteredBaseIngredients = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();
    if (!q) return baseIngredients;
    return baseIngredients.filter((ing) => ing.name.toLowerCase().includes(q));
  }, [baseIngredients, ingredientSearch]);

  // Financial calculations
  const financial = useMemo(() => {
    const ingredientsCost = recipeLines.reduce((acc, line) => acc + computeLineCost(line), 0);
    const kitchenCost = ingredientsCost * ((Number(kitchenCostPercent) || 0) / 100);
    const laborCost = Math.max(0, parseFloat(String(laborFixedCost).replace(',', '.')) || 0);
    const totalRecipeCost = ingredientsCost + kitchenCost + laborCost;

    const cleanProfit = totalRecipeCost * ((Number(profitPercent) || 0) / 100);
    const priceBeforeFee = totalRecipeCost + cleanProfit;

    const paymentMeta =
      PAYMENT_METHODS.find((m) => m.key === paymentMethod) || PAYMENT_METHODS[0];

    let idealTotalPrice = priceBeforeFee;
    let paymentFeeAmount = 0;

    if (priceBeforeFee > 0 && (paymentMeta.percentFee > 0 || paymentMeta.fixedFee > 0)) {
      const rate = paymentMeta.percentFee / 100;
      idealTotalPrice = (priceBeforeFee + paymentMeta.fixedFee) / (1 - rate);
      paymentFeeAmount = Math.max(0, idealTotalPrice - priceBeforeFee);
    }

    const safeYield = Math.max(1, Number(yieldQty) || 1);
    const unitCost = totalRecipeCost / safeYield;
    const unitProfit = cleanProfit / safeYield;
    const unitIdealPrice = idealTotalPrice / safeYield;

    return {
      ingredientsCost,
      kitchenCost,
      laborCost,
      totalRecipeCost,
      cleanProfit,
      paymentFeeAmount,
      idealTotalPrice,
      safeYield,
      unitCost,
      unitProfit,
      unitIdealPrice,
      paymentMeta,
    };
  }, [recipeLines, kitchenCostPercent, laborFixedCost, profitPercent, paymentMethod, yieldQty]);

  const handleResetCalculator = () => {
    setEditingRecipeId(null);
    setSelectedProductId('');
    setRecipeName('');
    setRecipeCategory(categoryOptions[0] || 'Outros');
    setYieldQty(1);
    setUnitType('unidade(s)');
    setRecipeLines([]);
    setKitchenCostPercent(15);
    setLaborFixedCost('');
    setProfitPercent(100);
    setPaymentMethod('zero_fee');
  };

  const handleLinkMenuProduct = (prodId: string) => {
    setSelectedProductId(prodId);
    if (!prodId) return;
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      if (!recipeName.trim()) {
        setRecipeName(prod.title);
      }
      if (prod.categoryTitle) {
        setRecipeCategory(prod.categoryTitle);
      }
    }
  };

  const handleLoadStarterIngredients = async () => {
    const existingNames = new Set(baseIngredients.map((i) => i.name.toLowerCase()));
    const toAdd = STARTER_BASE_INGREDIENTS.filter(
      (item) => !existingNames.has(item.name.toLowerCase())
    );
    const nextList = [...baseIngredients, ...toAdd];
    await persistBaseIngredients(nextList);
    toast.success(`${toAdd.length} ingredientes básicos carregados! Você pode editar os preços quando quiser.`);
  };

  const openNewIngredientModal = (editItem?: BaseIngredient) => {
    if (editItem) {
      setEditingBaseIngId(editItem.id);
      setIngModalName(editItem.name);
      setIngModalQty(String(editItem.packageQty));
      setIngModalUnit(editItem.unit);
      setIngModalPrice(String(editItem.packagePrice));
    } else {
      setEditingBaseIngId(null);
      setIngModalName(ingredientSearch.trim());
      setIngModalQty('1000');
      setIngModalUnit('g');
      setIngModalPrice('');
    }
    setIsIngredientModalOpen(true);
  };

  const handleSaveBaseIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = ingModalName.trim();
    const qty = parseFloat(ingModalQty.replace(',', '.')) || 0;
    const price = parseFloat(ingModalPrice.replace(',', '.')) || 0;

    if (!trimmedName) {
      toast.error('Digite o nome do ingrediente ou embalagem.');
      return;
    }
    if (qty <= 0 || price <= 0) {
      toast.error('Informe a quantidade da embalagem e o valor pago.');
      return;
    }

    let updatedList: BaseIngredient[];
    if (editingBaseIngId) {
      updatedList = baseIngredients.map((item) =>
        item.id === editingBaseIngId
          ? { ...item, name: trimmedName, packageQty: qty, unit: ingModalUnit, packagePrice: price }
          : item
      );
      // Also update any matching line currently in the active recipe
      setRecipeLines((prev) =>
        prev.map((line) =>
          line.baseIngredientId === editingBaseIngId
            ? {
                ...line,
                name: trimmedName,
                packageQty: qty,
                packageUnit: ingModalUnit,
                packagePrice: price,
                usedUnit: getRecipeUsedUnit(ingModalUnit),
              }
            : line
        )
      );
      toast.success('Ingrediente atualizado!');
    } else {
      const created: BaseIngredient = {
        id: `ing_${Date.now()}`,
        name: trimmedName,
        packageQty: qty,
        unit: ingModalUnit,
        packagePrice: price,
      };
      updatedList = [...baseIngredients, created];
      // Immediately add newly created ingredient into the recipe for convenience
      handleAddIngredientToRecipe(created);
      toast.success(`"${trimmedName}" cadastrado e adicionado à receita!`);
    }

    await persistBaseIngredients(updatedList);
    setIsIngredientModalOpen(false);
    setIngredientSearch('');
  };

  const handleDeleteBaseIngredient = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextList = baseIngredients.filter((item) => item.id !== id);
    await persistBaseIngredients(nextList);
    toast.success('Ingrediente removido da lista cadastrada.');
  };

  const handleAddIngredientToRecipe = (ing: BaseIngredient) => {
    const existing = recipeLines.find((l) => l.baseIngredientId === ing.id);
    if (existing) {
      toast.info(`"${ing.name}" já está na receita — ajuste a quantidade abaixo.`);
      return;
    }
    const usedUnit = getRecipeUsedUnit(ing.unit);
    const defaultUsed = usedUnit === 'un' ? 1 : 100;
    const newLine: RecipeIngredientLine = {
      id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      baseIngredientId: ing.id,
      name: ing.name,
      packageQty: ing.packageQty,
      packageUnit: ing.unit,
      packagePrice: ing.packagePrice,
      usedQty: defaultUsed,
      usedUnit,
    };
    setRecipeLines((prev) => [...prev, newLine]);
  };

  const handleUpdateLineQty = (lineId: string, val: number) => {
    setRecipeLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, usedQty: Math.max(0, val) } : l))
    );
  };

  const handleRemoveLine = (lineId: string) => {
    setRecipeLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const handleSaveRecipe = async () => {
    const cleanName = recipeName.trim();
    if (!cleanName) {
      toast.error('Informe o Nome da Receita / Produto no passo 1.');
      return;
    }
    if (!db) {
      toast.error('Banco de dados indisponível.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        productId: selectedProductId || '',
        productName: cleanName,
        category: recipeCategory || 'Outros',
        yieldQty: financial.safeYield,
        unitType,
        recipeIngredients: recipeLines,
        kitchenCostPercent,
        laborFixedCost: financial.laborCost,
        profitPercent,
        paymentMethod,
        totalDirectCost: Number(financial.totalRecipeCost.toFixed(2)),
        cleanProfit: Number(financial.cleanProfit.toFixed(2)),
        suggestedPrice: Number(financial.idealTotalPrice.toFixed(2)),
        unitSuggestedPrice: Number(financial.unitIdealPrice.toFixed(2)),
        updatedAt: serverTimestamp(),
      };

      if (editingRecipeId) {
        await updateDoc(doc(db, 'fichas_tecnicas', editingRecipeId), payload);
        toast.success(`Receita "${cleanName}" atualizada!`);
      } else {
        const ref = await addDoc(collection(db, 'fichas_tecnicas'), payload);
        setEditingRecipeId(ref.id);
        toast.success(`Receita "${cleanName}" salva com sucesso!`);
      }
    } catch (err) {
      console.error('Erro ao salvar receita:', err);
      toast.error('Erro ao salvar a receita. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyPriceToMenuProduct = async (
    targetProductId?: string,
    targetPrice?: number
  ) => {
    const prodId = targetProductId || selectedProductId;
    const priceToApply =
      targetPrice !== undefined
        ? targetPrice
        : financial.safeYield > 1
        ? financial.unitIdealPrice
        : financial.idealTotalPrice;

    if (!prodId || !db) {
      toast.error('Selecione um produto do cardápio para atualizar o preço.');
      return;
    }
    if (priceToApply <= 0) {
      toast.error('Monte a receita antes de aplicar o preço ao cardápio.');
      return;
    }

    setIsApplyingToProduct(true);
    try {
      const rounded = Number(priceToApply.toFixed(2));
      await updateDoc(doc(db, 'produtos', prodId), { price: rounded });
      const prod = products.find((p) => p.id === prodId);
      toast.success(
        `Preço de "${prod?.title || 'Produto'}" atualizado para ${formatMoney(rounded)} no cardápio!`
      );
    } catch (err) {
      console.error('Erro ao atualizar preço do produto:', err);
      toast.error('Erro ao aplicar preço no cardápio.');
    } finally {
      setIsApplyingToProduct(false);
    }
  };

  const handleLoadRecipeIntoCalculator = (recipe: SavedPricingRecipe) => {
    setEditingRecipeId(recipe.id);
    setSelectedProductId(recipe.productId || '');
    setRecipeName(recipe.productName || '');
    setRecipeCategory(recipe.category || categoryOptions[0] || 'Outros');
    setYieldQty(Math.max(1, Number(recipe.yieldQty) || 1));
    setUnitType(recipe.unitType || 'unidade(s)');
    setKitchenCostPercent(
      recipe.kitchenCostPercent !== undefined ? Number(recipe.kitchenCostPercent) : 15
    );
    setLaborFixedCost(
      recipe.laborFixedCost && recipe.laborFixedCost > 0
        ? String(recipe.laborFixedCost)
        : ''
    );
    setProfitPercent(
      recipe.profitPercent !== undefined ? Number(recipe.profitPercent) : 100
    );
    setPaymentMethod(recipe.paymentMethod || 'zero_fee');

    if (Array.isArray(recipe.recipeIngredients)) {
      setRecipeLines(recipe.recipeIngredients);
    } else if (Array.isArray(recipe.ingredients)) {
      // Backwards-compatible migration from older ficha format
      const converted: RecipeIngredientLine[] = recipe.ingredients
        .filter((i: any) => i && i.name)
        .map((i: any, idx: number) => ({
          id: `legacy_${idx}_${Date.now()}`,
          name: i.name,
          packageQty: Number(i.packageWeight) || 1000,
          packageUnit: (i.unit === 'un' ? 'un' : i.unit === 'ml' ? 'ml' : 'g') as IngredientUnit,
          packagePrice: Number(i.packagePrice) || 0,
          usedQty: Number(i.recipeQuantity) || 0,
          usedUnit: (i.unit === 'un' ? 'un' : i.unit === 'ml' ? 'ml' : 'g') as 'g' | 'ml' | 'un',
        }));
      setRecipeLines(converted);
    } else {
      setRecipeLines([]);
    }

    setActiveSubTab('calculator');
    toast.info(`Editando receita "${recipe.productName}"`);
  };

  const handleDeleteSavedRecipe = async (recipe: SavedPricingRecipe) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'fichas_tecnicas', recipe.id));
      if (editingRecipeId === recipe.id) {
        handleResetCalculator();
      }
      toast.success(`Receita "${recipe.productName}" excluída.`);
    } catch (err) {
      console.error('Erro ao excluir receita:', err);
      toast.error('Erro ao excluir receita.');
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-10">
      {/* Top Bar: Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">
            Precificação Inteligente
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            Calcule custos reais, margem de lucro e taxas de pagamento em 3 passos simples.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center p-1 bg-stone-100 rounded-2xl border border-stone-200/80">
            <button
              type="button"
              onClick={() => setActiveSubTab('calculator')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'calculator'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Calculator size={14} />
              <span>Calculadora</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('saved')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'saved'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <BookOpen size={14} />
              <span>Receitas Salvas ({savedRecipes.length})</span>
            </button>
          </div>

          {activeSubTab === 'calculator' && (editingRecipeId || recipeName || recipeLines.length > 0) && (
            <button
              type="button"
              onClick={handleResetCalculator}
              className="p-2.5 rounded-xl bg-white border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition-all cursor-pointer"
              title="Limpar e começar nova receita"
            >
              <RotateCcw size={15} />
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'calculator' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: STEPS 1 & 2 */}
          <div className="lg:col-span-7 space-y-6">
            {/* CARD 1: 1. Qual é a receita ou produto? */}
            <div className="bg-white rounded-3xl border border-stone-200/90 shadow-sm p-6 space-y-5">
              <div className="border-b border-stone-100 pb-4">
                <h3 className="text-xl font-serif font-bold text-stone-900">
                  1. Qual é a receita ou produto?
                </h3>
                <p className="text-xs text-stone-500 mt-1">
                  Dê um nome fácil e diga quantas unidades essa receita inteira rende.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-8 space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">
                    Nome da Receita / Produto *
                  </label>
                  <input
                    type="text"
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    placeholder="Ex: Açaí Bowl 500ml, Pastel de Queijo, Brigadeiro..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/15"
                  />
                </div>

                <div className="sm:col-span-4 space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">
                    Categoria
                  </label>
                  <select
                    value={recipeCategory}
                    onChange={(e) => setRecipeCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/15 cursor-pointer"
                  >
                    {categoryOptions.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">
                    Rende quantas unidades?
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={yieldQty}
                    onChange={(e) => setYieldQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/15"
                  />
                  <p className="text-[11px] text-stone-500 leading-snug">
                    Deixe <strong>1</strong> para produto inteiro, ou digite ex: <strong>25</strong> docinhos / <strong>8</strong> potes.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">
                    Tipo de unidade
                  </label>
                  <select
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/15 cursor-pointer"
                  >
                    {UNIT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Menu Product Link */}
              {products.length > 0 && (
                <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <label className="text-[11px] font-bold text-stone-500 flex items-center gap-1.5 shrink-0">
                    <Link2 size={13} />
                    <span>Vincular ao Cardápio (opcional):</span>
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => handleLinkMenuProduct(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-stone-50/70 text-xs font-semibold text-stone-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                  >
                    <option value="">Não vincular (receita avulsa)</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} — Atual: {formatMoney(p.price || 0)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* CARD 2: 2. O que vai nessa receita? */}
            <div className="bg-white rounded-3xl border border-stone-200/90 shadow-sm p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-serif font-bold text-stone-900">
                    2. O que vai nessa receita?
                  </h3>
                  <p className="text-xs text-stone-500 mt-1">
                    Escolha ingredientes já cadastrados abaixo e coloque só quanto você usa na receita.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openNewIngredientModal()}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-stone-300 hover:bg-stone-50 text-xs font-bold text-stone-800 shadow-2xs transition-all cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Cadastrar Novo Ingrediente</span>
                </button>
              </div>

              {/* Search & Registered Ingredients Pantry */}
              <div className="bg-stone-50/90 border border-stone-200/80 rounded-2xl p-4 space-y-3.5">
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <input
                    type="text"
                    value={ingredientSearch}
                    onChange={(e) => setIngredientSearch(e.target.value)}
                    placeholder="Buscar ingrediente já cadastrado para adicionar..."
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-xs sm:text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                  />
                </div>

                {baseIngredients.length === 0 ? (
                  <div className="py-4 text-center space-y-3">
                    <p className="text-xs text-stone-500">
                      Você ainda não cadastrou nenhum ingrediente ou embalagem.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleLoadStarterIngredients}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-stone-300 hover:bg-stone-100 text-xs font-bold text-stone-800 transition-all cursor-pointer shadow-2xs"
                      >
                        <Sparkles size={14} />
                        <span>Carregar Ingredientes Básicos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openNewIngredientModal()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer hover:brightness-110"
                        style={{ backgroundColor: accentColor, color: accentText }}
                      >
                        <Plus size={14} />
                        <span>Cadastrar Primeiro Ingrediente</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredBaseIngredients.length === 0 ? (
                      <div className="py-3 text-center space-y-2">
                        <p className="text-xs text-stone-500">
                          Nenhum ingrediente encontrado para "{ingredientSearch}".
                        </p>
                        <button
                          type="button"
                          onClick={() => openNewIngredientModal()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                          style={{ backgroundColor: accentColor, color: accentText }}
                        >
                          <Plus size={13} />
                          <span>Cadastrar "{ingredientSearch}"</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-h-[168px] overflow-y-auto pr-1">
                        {filteredBaseIngredients.map((ing) => {
                          const alreadyAdded = recipeLines.some(
                            (l) => l.baseIngredientId === ing.id
                          );
                          return (
                            <div
                              key={ing.id}
                              onClick={() => handleAddIngredientToRecipe(ing)}
                              className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer select-none ${
                                alreadyAdded
                                  ? 'bg-stone-900 border-stone-900 text-white'
                                  : 'bg-white border-stone-200 text-stone-800 hover:border-stone-400 hover:shadow-2xs'
                              }`}
                            >
                              <span className="font-bold">{ing.name}</span>
                              <span
                                className={`text-[10px] font-medium ${
                                  alreadyAdded ? 'text-white/70' : 'text-stone-400'
                                }`}
                              >
                                {ing.packageQty}
                                {ing.unit} · {formatMoney(ing.packagePrice)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openNewIngredientModal(ing);
                                }}
                                className={`p-0.5 rounded opacity-60 hover:opacity-100 cursor-pointer ${
                                  alreadyAdded ? 'text-white' : 'text-stone-500'
                                }`}
                                title="Editar preço/embalagem"
                              >
                                <Edit2 size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteBaseIngredient(ing.id, e)}
                                className={`p-0.5 rounded opacity-50 hover:opacity-100 cursor-pointer ${
                                  alreadyAdded ? 'text-white' : 'text-rose-500'
                                }`}
                                title="Remover da lista"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Active Recipe Ingredients List */}
              {recipeLines.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-stone-200 py-7 px-4 text-center text-xs sm:text-sm text-stone-400 font-medium">
                  Clique nos ingredientes acima para montar sua receita.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recipeLines.map((line) => {
                    const cost = computeLineCost(line);
                    return (
                      <div
                        key={line.id}
                        className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 rounded-2xl border border-stone-200 bg-white shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                            {line.name}
                          </p>
                          <p className="text-[11px] text-stone-400">
                            Embalagem: {line.packageQty}
                            {line.packageUnit} por {formatMoney(line.packagePrice)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center rounded-xl border border-stone-300 bg-stone-50 overflow-hidden">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={line.usedQty || ''}
                              onChange={(e) =>
                                handleUpdateLineQty(
                                  line.id,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-20 px-2.5 py-1.5 text-xs font-bold text-stone-900 bg-white text-right focus:outline-none"
                              aria-label={`Quantidade usada de ${line.name}`}
                            />
                            <span className="px-2.5 py-1.5 text-[11px] font-bold text-stone-500 bg-stone-100 border-l border-stone-200">
                              {line.usedUnit}
                            </span>
                          </div>

                          <span className="w-16 text-right text-xs font-black text-stone-900 tabular-nums">
                            {formatMoney(cost)}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Remover ingrediente da receita"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Kitchen Utilities (Gás, Luz, Água e Detergente) */}
              <div className="pt-4 border-t border-stone-100 space-y-3">
                <label className="text-xs font-bold text-stone-700 block">
                  Gás, Luz, Água e Detergente (Custos da Cozinha)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {KITCHEN_COST_PRESETS.map((preset) => {
                    const isSelected = kitchenCostPercent === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setKitchenCostPercent(preset.value)}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                          isSelected
                            ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-sm'
                            : 'bg-white border-stone-200 text-stone-700 hover:border-stone-400'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Fixed Labor Cost */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 block">
                  Meu trabalho / tempo neste item ({currencySymbol} opcional)
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.50"
                    value={laborFixedCost}
                    onChange={(e) => setLaborFixedCost(e.target.value)}
                    placeholder="0.00 (opcional)"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm font-semibold text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/15"
                  />
                </div>
                <p className="text-[11px] text-stone-500">
                  Se quiser somar um valor fixo pelo seu tempo de produção/decoração, coloque aqui.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (STICKY): STEP 3 */}
          <div className="lg:col-span-5 lg:sticky lg:top-6">
            <div className="bg-white rounded-3xl border border-stone-200/90 shadow-md p-6 space-y-5">
              <div className="border-b border-stone-100 pb-3.5">
                <h3 className="text-xl font-serif font-bold text-stone-900">
                  3. Lucro, Taxas e Preço Final
                </h3>
              </div>

              {/* Profit Margin Presets */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-stone-800 block">
                  Quanto quero ganhar nesse item (%)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PROFIT_PRESETS.map((preset) => {
                    const isSelected = profitPercent === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setProfitPercent(preset.value)}
                        className={`px-2 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center leading-tight ${
                          isSelected
                            ? 'border-transparent shadow-sm'
                            : 'bg-white border-stone-200 text-stone-700 hover:border-stone-400'
                        }`}
                        style={
                          isSelected
                            ? { backgroundColor: accentColor, color: accentText }
                            : undefined
                        }
                      >
                        <span>{preset.label}</span>
                        {preset.sublabel && (
                          <span className="text-[10px] opacity-90 mt-0.5">
                            {preset.sublabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2.5 pt-1">
                  <span className="text-xs font-medium text-stone-600">Ou digite a %:</span>
                  <div className="inline-flex items-center rounded-xl border border-stone-300 bg-white overflow-hidden">
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={profitPercent}
                      onChange={(e) =>
                        setProfitPercent(Math.max(0, parseFloat(e.target.value) || 0))
                      }
                      className="w-20 px-3 py-1.5 text-sm font-bold text-stone-900 focus:outline-none"
                    />
                    <span className="pr-3 text-xs font-bold text-stone-400">%</span>
                  </div>
                </div>
              </div>

              {/* Payment Fee Selector */}
              <div className="space-y-2.5 pt-2 border-t border-stone-100">
                <label className="text-xs font-bold text-stone-800 block">
                  Incluir taxa de pagamento?
                </label>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  <strong className="text-stone-700">Zelle e Venmo não têm taxa.</strong> Se o cliente pagar com cartão ou PayPal, clique abaixo para somar a taxa sem tirar do seu lucro:
                </p>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {PAYMENT_METHODS.map((pm) => {
                    const isSelected = paymentMethod === pm.key;
                    return (
                      <button
                        key={pm.key}
                        type="button"
                        onClick={() => setPaymentMethod(pm.key)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                          isSelected
                            ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-sm'
                            : 'bg-white border-stone-200 text-stone-800 hover:border-stone-400'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0">
                          {pm.icon === 'phone' ? (
                            <Smartphone size={14} />
                          ) : (
                            <CreditCard size={14} />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-bold leading-snug">
                            {pm.title}
                          </span>
                          <span
                            className={`block text-[10px] mt-0.5 ${
                              isSelected ? 'text-white/70' : 'text-stone-400'
                            }`}
                          >
                            {pm.subtitle}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Cost & Profit Breakdown */}
              <div className="pt-3 border-t border-stone-100 space-y-2 text-xs sm:text-sm">
                <div className="flex items-center justify-between text-stone-600">
                  <span>Ingredientes e embalagens:</span>
                  <span className="font-bold text-stone-900 tabular-nums">
                    {formatMoney(financial.ingredientsCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-stone-600">
                  <span>Gás / Luz / Água (+{kitchenCostPercent}%):</span>
                  <span className="font-bold text-stone-900 tabular-nums">
                    {formatMoney(financial.kitchenCost)}
                  </span>
                </div>
                {financial.laborCost > 0 && (
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Meu trabalho / tempo:</span>
                    <span className="font-bold text-stone-900 tabular-nums">
                      {formatMoney(financial.laborCost)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between font-bold text-stone-900">
                  <span>Custo total da receita:</span>
                  <span className="tabular-nums">{formatMoney(financial.totalRecipeCost)}</span>
                </div>

                <div className="flex items-center justify-between font-bold text-emerald-700">
                  <span>Seu lucro limpo (na receita):</span>
                  <span className="tabular-nums">+ {formatMoney(financial.cleanProfit)}</span>
                </div>

                {financial.paymentFeeAmount > 0 && (
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>Taxa {financial.paymentMeta.title} (inclusa):</span>
                    <span className="font-semibold tabular-nums">
                      + {formatMoney(financial.paymentFeeAmount)}
                    </span>
                  </div>
                )}

                {financial.safeYield > 1 && (
                  <div className="pt-2 border-t border-dashed border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
                    <span>
                      Por unidade: Custo <strong className="text-stone-800">{formatMoney(financial.unitCost)}</strong>
                    </span>
                    <span>
                      Lucro <strong className="text-emerald-700">+ {formatMoney(financial.unitProfit)}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Highlighted Ideal Price Box */}
              <div
                className="rounded-2xl border p-4 text-center space-y-1"
                style={{
                  backgroundColor: `${accentColor}12`,
                  borderColor: `${accentColor}30`,
                }}
              >
                <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-stone-700">
                  {financial.safeYield > 1
                    ? `PREÇO IDEAL POR ${unitType.toUpperCase()}`
                    : 'PREÇO IDEAL PARA VENDER'}
                </span>
                <p
                  className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums"
                  style={{ color: accentColor }}
                >
                  {formatMoney(
                    financial.safeYield > 1
                      ? financial.unitIdealPrice
                      : financial.idealTotalPrice
                  )}
                </p>
                {financial.safeYield > 1 && (
                  <p className="text-[11px] font-semibold text-stone-600">
                    Receita inteira ({financial.safeYield} {unitType}):{' '}
                    <strong className="text-stone-900">
                      {formatMoney(financial.idealTotalPrice)}
                    </strong>
                  </p>
                )}
              </div>

              {/* Primary Save CTA + Optional Apply to Menu */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveRecipe}
                  className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm shadow-md hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: accentColor, color: accentText }}
                >
                  <Save size={16} />
                  <span>
                    {isSaving
                      ? 'Salvando...'
                      : editingRecipeId
                      ? 'Atualizar Receita e Preço'
                      : 'Salvar Receita e Preço'}
                  </span>
                </button>

                {selectedProductId && (
                  <button
                    type="button"
                    disabled={isApplyingToProduct}
                    onClick={() => handleApplyPriceToMenuProduct()}
                    className="w-full py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    <span>
                      {isApplyingToProduct
                        ? 'Atualizando cardápio...'
                        : `Aplicar ${formatMoney(
                            financial.safeYield > 1
                              ? financial.unitIdealPrice
                              : financial.idealTotalPrice
                          )} no Cardápio`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* SAVED RECIPES TAB */
        <div className="space-y-4">
          {savedRecipes.length === 0 ? (
            <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center space-y-3">
              <Calculator size={36} className="mx-auto text-stone-300" />
              <p className="text-base font-serif font-bold text-stone-800">
                Nenhuma receita salva ainda
              </p>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Monte sua primeira receita na aba Calculadora para guardar seus custos, lucros e preços ideais aqui.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('calculator')}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer shadow-sm"
                style={{ backgroundColor: accentColor, color: accentText }}
              >
                <Plus size={14} />
                <span>Criar Primeira Receita</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedRecipes.map((rec) => {
                const displayUnitPrice =
                  rec.unitSuggestedPrice && rec.yieldQty > 1
                    ? rec.unitSuggestedPrice
                    : rec.suggestedPrice || 0;
                return (
                  <div
                    key={rec.id}
                    className="bg-white rounded-2xl border border-stone-200/90 shadow-xs p-5 flex flex-col justify-between gap-4 hover:shadow-md transition-all"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            {rec.category || 'Receita'} · Rende {rec.yieldQty || 1}{' '}
                            {rec.unitType || 'un'}
                          </span>
                          <h4 className="font-serif font-bold text-lg text-stone-900 truncate">
                            {rec.productName}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedRecipe(rec)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Excluir receita"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100 text-xs">
                        <div className="p-2.5 rounded-xl bg-stone-50">
                          <span className="block text-[10px] text-stone-500 font-semibold">
                            Custo Total
                          </span>
                          <span className="font-bold text-stone-900 tabular-nums">
                            {formatMoney(rec.totalDirectCost || 0)}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-50/70">
                          <span className="block text-[10px] text-emerald-700 font-semibold">
                            Lucro Limpo
                          </span>
                          <span className="font-bold text-emerald-800 tabular-nums">
                            + {formatMoney(rec.cleanProfit || 0)}
                          </span>
                        </div>
                      </div>

                      <div
                        className="p-3 rounded-xl flex items-center justify-between"
                        style={{ backgroundColor: `${accentColor}10` }}
                      >
                        <span className="text-[11px] font-bold text-stone-700">
                          {rec.yieldQty > 1 ? 'Preço Ideal (un):' : 'Preço Ideal:'}
                        </span>
                        <span
                          className="text-lg font-black tabular-nums"
                          style={{ color: accentColor }}
                        >
                          {formatMoney(displayUnitPrice)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleLoadRecipeIntoCalculator(rec)}
                        className="flex-1 py-2 px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-xs font-bold text-stone-800 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Edit2 size={13} />
                        <span>Abrir</span>
                      </button>
                      {rec.productId && (
                        <button
                          type="button"
                          onClick={() =>
                            handleApplyPriceToMenuProduct(rec.productId, displayUnitPrice)
                          }
                          className="flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:brightness-110"
                          style={{ backgroundColor: accentColor, color: accentText }}
                        >
                          <CheckCircle2 size={13} />
                          <span>Aplicar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Cadastrar / Editar Ingrediente Base */}
      {isIngredientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-lg font-serif font-bold text-stone-900">
                {editingBaseIngId ? 'Editar Ingrediente' : 'Cadastrar Novo Ingrediente'}
              </h3>
              <button
                type="button"
                onClick={() => setIsIngredientModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBaseIngredient} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 block">
                  Nome do Ingrediente ou Embalagem *
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={ingModalName}
                  onChange={(e) => setIngModalName(e.target.value)}
                  placeholder="Ex: Polpa de Açaí, Leite Condensado, Embalagem Bowl"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">
                    Tamanho da Embalagem *
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    required
                    value={ingModalQty}
                    onChange={(e) => setIngModalQty(e.target.value)}
                    placeholder="Ex: 1000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm font-bold text-stone-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">
                    Unidade *
                  </label>
                  <select
                    value={ingModalUnit}
                    onChange={(e) => setIngModalUnit(e.target.value as IngredientUnit)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900 cursor-pointer"
                  >
                    <option value="g">Gramas (g)</option>
                    <option value="kg">Quilos (kg)</option>
                    <option value="ml">Mililitros (ml)</option>
                    <option value="L">Litros (L)</option>
                    <option value="un">Unidades (un)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 block">
                  Quanto você paga na embalagem fechada ({currencySymbol}) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    value={ingModalPrice}
                    onChange={(e) => setIngModalPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-stone-300 text-sm font-bold text-stone-900"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsIngredientModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-xs font-bold text-stone-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:brightness-110 cursor-pointer"
                  style={{ backgroundColor: accentColor, color: accentText }}
                >
                  {editingBaseIngId ? 'Salvar Alteração' : 'Salvar Ingrediente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
