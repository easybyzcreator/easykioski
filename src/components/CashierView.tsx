import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  CartItem,
  Category,
  Order,
  OrderItem,
  OrderModality,
  Product,
  ProductSize,
  Settings,
  Side,
} from '../types';
import { getBrandTheme } from '../utils/brandTheme';
import { formatMoney } from '../utils/kioskI18n';
import { getContrastText } from '../utils/orderUtils';
import { generateNextDailyOrderNumber } from '../services/orderNumberService';
import { printDualOrderReceipts, triggerBrowserIframePrint } from '../services/printService';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  Banknote,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Loader2,
  Lock,
  Minus,
  Monitor,
  Plus,
  Printer,
  Search,
  Settings as SettingsIcon,
  ShoppingBag,
  Smartphone,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';

type CashierPaymentMethod = 'cash' | 'card' | 'venmo' | 'paypal' | 'cashapp' | 'zelle';

interface CashierViewProps {
  settings: Settings;
  initialUnlocked?: boolean;
  onExitToKiosk: () => void;
  onOpenAdmin: () => void;
  onOpenKDS: () => void;
}

const getMaxFillingsForSize = (product: Product, selectedSize?: ProductSize): number => {
  if (selectedSize?.name) {
    const match = selectedSize.name.match(/(\d+)/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (parsed > 0 && parsed <= 20) return parsed;
    }
  }
  return Math.max(1, product.maxFillings || 1);
};

export const CashierView: React.FC<CashierViewProps> = ({
  settings,
  initialUnlocked = false,
  onExitToKiosk,
  onOpenAdmin,
  onOpenKDS,
}) => {
  const [isUnlocked, setIsUnlocked] = useState(Boolean(initialUnlocked));
  const [passwordInput, setPasswordInput] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sides, setSides] = useState<Side[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Order / Comanda state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [orderType, setOrderType] = useState<OrderModality>('dine_in');
  const [tableOrPager, setTableOrPager] = useState('');
  const [orderObservation, setOrderObservation] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<CashierPaymentMethod>('card');
  const [markAsPaid, setMarkAsPaid] = useState(true);
  const [cashReceivedInput, setCashReceivedInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<Order | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Customization modal state
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [modalSize, setModalSize] = useState<ProductSize | undefined>(undefined);
  const [modalFillings, setModalFillings] = useState<string[]>([]);
  const [modalSides, setModalSides] = useState<Side[]>([]);
  const [modalRemovals, setModalRemovals] = useState<string[]>([]);
  const [modalObs, setModalObs] = useState('');
  const [modalQty, setModalQty] = useState(1);

  const theme = getBrandTheme(settings);
  const primaryColor = theme.primary;
  const primaryContrast = getContrastText(primaryColor);
  const currency = settings.currency || 'USD';
  const taxRate = typeof settings.salesTaxRate === 'number' && !isNaN(settings.salesTaxRate) ? settings.salesTaxRate : 7.75;

  useEffect(() => {
    if (initialUnlocked) setIsUnlocked(true);
  }, [initialUnlocked]);

  // Real-time catalog subscriptions
  useEffect(() => {
    if (!isUnlocked) return;
    setLoadingCatalog(true);

    const unsubCats = onSnapshot(
      query(collection(db, 'categorias'), orderBy('order', 'asc')),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Category))
          .filter((c) => c.catalog !== 'catalog_b2b' && c.catalog !== 'b2b');
        setCategories(list);
      }
    );

    const unsubProds = onSnapshot(collection(db, 'produtos'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Product))
        .filter((p) => p.isActive !== false);
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setProducts(list);
      setLoadingCatalog(false);
    });

    const unsubSides = onSnapshot(collection(db, 'acompanhamentos'), (snap) => {
      setSides(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Side)));
    });

    return () => {
      unsubCats();
      unsubProds();
      unsubSides();
    };
  }, [isUnlocked]);

  const activeCategories = useMemo(() => {
    return categories.filter((cat) =>
      products.some((p) => p.categoryId === cat.id)
    );
  }, [categories, products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) {
        return false;
      }
      if (!q) return true;
      return (
        (p.title || '').toLowerCase().includes(q) ||
        (p.title_pt || '').toLowerCase().includes(q) ||
        (p.title_en || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategoryId, searchQuery]);

  const needsCustomization = (product: Product): boolean => {
    const hasValidSizes = Boolean(product.hasSizes && product.sizes && product.sizes.length > 0);
    const hasFillings = Boolean(product.isCustomSandwich && (product.customFillings || '').trim());
    const hasMealOpts = Boolean(
      product.isMeal &&
        ((product.allowedSides && product.allowedSides.length > 0) ||
          (product.ingredients || '').trim())
    );
    return hasValidSizes || hasFillings || hasMealOpts;
  };

  const openCustomizationModal = (product: Product) => {
    setCustomizingProduct(product);
    setModalSize(product.hasSizes && product.sizes?.length ? product.sizes[0] : undefined);
    setModalFillings([]);
    setModalSides([]);
    setModalRemovals([]);
    setModalObs('');
    setModalQty(1);
  };

  const handleProductClick = (product: Product) => {
    setLastCreatedOrder(null);
    if (needsCustomization(product)) {
      openCustomizationModal(product);
      return;
    }

    // Quick add simple item
    setCart((prev) => {
      const existing = prev.find(
        (item) =>
          item.productId === product.id &&
          !item.selectedSize &&
          !item.sandwichOptions &&
          !item.mealOptions &&
          !item.observation
      );
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          productId: product.id,
          quantity: 1,
        },
      ];
    });
  };

  const handleConfirmCustomizedItem = () => {
    if (!customizingProduct) return;

    const fillingsList = (customizingProduct.customFillings || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const fillingsRequired =
      customizingProduct.isCustomSandwich &&
      fillingsList.length > 0 &&
      customizingProduct.fillingsRequired !== false;

    if (fillingsRequired && modalFillings.length === 0) {
      toast.error('Selecione pelo menos 1 recheio antes de adicionar.');
      return;
    }

    const newItem: CartItem = {
      id: `${customizingProduct.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productId: customizingProduct.id,
      quantity: modalQty,
      ...(modalSize ? { selectedSize: modalSize } : {}),
      ...(modalFillings.length > 0 ? { sandwichOptions: { fillings: modalFillings } } : {}),
      ...(modalSides.length > 0 || modalRemovals.length > 0
        ? { mealOptions: { sides: modalSides, removals: modalRemovals } }
        : {}),
      ...(modalObs.trim() ? { observation: modalObs.trim() } : {}),
    };

    setCart((prev) => [...prev, newItem]);
    setCustomizingProduct(null);
  };

  const updateCartQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === cartItemId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const getCartItemUnitPrice = (item: CartItem): number => {
    const product = products.find((p) => p.id === item.productId);
    const basePrice = item.selectedSize
      ? item.selectedSize.price
      : product?.price && product.price > 0
        ? product.price
        : product?.oldPrice || 0;
    const sidesPrice = item.mealOptions?.sides?.reduce((sum, s) => sum + (s.price || 0), 0) || 0;
    return basePrice + sidesPrice;
  };

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + getCartItemUnitPrice(item) * item.quantity, 0);
  }, [cart, products]);

  const taxAmount = useMemo(() => {
    return Math.round(subtotal * (taxRate / 100) * 100) / 100;
  }, [subtotal, taxRate]);

  const grandTotal = useMemo(() => {
    return Math.round((subtotal + taxAmount) * 100) / 100;
  }, [subtotal, taxAmount]);

  const cashReceivedNum = parseFloat(cashReceivedInput.replace(',', '.')) || 0;
  const changeDue = paymentMethod === 'cash' && cashReceivedNum > grandTotal
    ? Math.round((cashReceivedNum - grandTotal) * 100) / 100
    : 0;

  const handleFinalizeOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const orderNumber = await generateNextDailyOrderNumber();

      const orderItems: OrderItem[] = cart.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        const unitPrice = getCartItemUnitPrice(item);
        const entry: OrderItem = {
          title: product?.title || 'Item',
          quantity: item.quantity,
          price: unitPrice,
          priceType: product?.priceType || 'fixed',
        };
        if (item.selectedSize) entry.selectedSize = item.selectedSize;
        if (item.sandwichOptions) entry.sandwichOptions = item.sandwichOptions;
        if (item.mealOptions) entry.mealOptions = item.mealOptions;
        if (item.observation) entry.observation = item.observation;
        return entry;
      });

      const cleanCustomer = customerName.trim() || `Balcão #${orderNumber}`;
      const nowIso = new Date().toISOString();

      const orderDocData: Record<string, any> = {
        orderNumber,
        customerName: cleanCustomer,
        orderType,
        tableOrPager: tableOrPager.trim(),
        phone: '',
        address: orderType === 'dine_in' ? 'DINE-IN (CAIXA)' : 'TAKEOUT (CAIXA)',
        deliveryType: 'pickup',
        birthday: '',
        email: '',
        observation: orderObservation.trim(),
        items: orderItems,
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate,
        taxAmount,
        tipAmount: 0,
        total: grandTotal,
        paymentStatus: markAsPaid ? 'paid' : 'awaiting_payment',
        paymentProvider: paymentMethod,
        kitchenStatus: 'preparing',
        source: 'manual',
        orderSource: 'cashier',
        orderLanguage: settings.language || 'en',
        createdAt: serverTimestamp(),
      };

      if (markAsPaid) {
        orderDocData.paymentConfirmedAt = serverTimestamp();
      }

      const docRef = await addDoc(collection(db, 'pedidos'), orderDocData);

      const createdOrder: Order = {
        ...(orderDocData as Order),
        id: docRef.id,
        createdAt: nowIso,
      };

      setLastCreatedOrder(createdOrder);
      setCart([]);
      setCustomerName('');
      setTableOrPager('');
      setOrderObservation('');
      setCashReceivedInput('');

      toast.success(
        markAsPaid
          ? `Pedido #${orderNumber} pago e enviado para a Cozinha (KDS)!`
          : `Pedido #${orderNumber} criado (Aguardando Pagamento)!`
      );
    } catch (err: any) {
      console.error('Erro ao finalizar pedido no Caixa:', err);
      toast.error('Erro ao salvar pedido no Caixa. Verifique a conexão e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintLastOrder = async () => {
    if (!lastCreatedOrder || isPrinting) return;
    setIsPrinting(true);
    try {
      const res = await printDualOrderReceipts(lastCreatedOrder, settings);
      if (res.mode === 'qz-tray') {
        toast.success(`Comanda #${lastCreatedOrder.orderNumber} enviada para a impressora!`);
      } else {
        triggerBrowserIframePrint([res.customerHtml, res.kitchenHtml]);
      }
    } catch (err) {
      console.error('Erro ao imprimir comanda no Caixa:', err);
      toast.error('Erro ao imprimir comanda.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const expected = settings.adminPassword || 'admin123';
    if (passwordInput === expected) {
      setIsUnlocked(true);
      setPasswordInput('');
      toast.success('Acesso ao Caixa liberado!');
    } else {
      toast.error('Senha incorreta.');
      setPasswordInput('');
    }
  };

  // Password gate when visiting /cashier directly
  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-stone-950/90">
        <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl border border-stone-200 space-y-5">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-md shrink-0"
              style={{ backgroundColor: primaryColor, color: primaryContrast }}
            >
              <Lock size={22} />
            </div>
            <div>
              <h1 className="font-serif font-black text-xl text-stone-900">Caixa da Loja (PDV)</h1>
              <p className="text-xs text-stone-500">Digite a senha do Painel Admin para abrir o Caixa</p>
            </div>
          </div>

          <form onSubmit={handleUnlockSubmit} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Senha do administrador"
              className="w-full px-4 py-3 rounded-2xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-2xl font-bold text-sm shadow-md cursor-pointer transition-all hover:brightness-110"
              style={{ backgroundColor: primaryColor, color: primaryContrast }}
            >
              Entrar no Caixa
            </button>
          </form>

          <button
            type="button"
            onClick={onExitToKiosk}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            Voltar para o Totem
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col">
      {/* Top Cashier Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200 px-4 py-3 shadow-2xs">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {settings.logo && (
              <img
                src={settings.logo}
                alt="Logo"
                className="w-10 h-10 rounded-full object-cover border-2 shrink-0"
                style={{ borderColor: primaryColor }}
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif font-black text-lg sm:text-xl leading-none text-stone-900">
                  {settings.brandName || 'Easy Kioski'}
                </h1>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  Caixa / PDV
                </span>
              </div>
              <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                Lançamento rápido de pedidos no balcão integrado à Cozinha e Histórico
              </p>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar item no cardápio..."
              className="w-full pl-10 pr-8 py-2 rounded-xl border border-stone-300 bg-stone-50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/15"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Quick Navigation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenKDS}
              className="px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <ChefHat size={15} />
              <span className="hidden sm:inline">Cozinha (KDS)</span>
            </button>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="px-3 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <SettingsIcon size={15} />
              <span className="hidden sm:inline">Admin</span>
            </button>
            <button
              type="button"
              onClick={onExitToKiosk}
              className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Monitor size={15} />
              <span className="hidden sm:inline">Totem</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main 2-Column POS Workspace */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">
        {/* LEFT COLUMN: Category Tabs + Product Grid */}
        <div className="lg:col-span-8 flex flex-col gap-4 min-w-0">
          {/* Category Filter Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className="px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer border shrink-0"
              style={
                selectedCategoryId === 'all'
                  ? { backgroundColor: primaryColor, color: primaryContrast, borderColor: primaryColor }
                  : { backgroundColor: '#FFFFFF', color: '#292524', borderColor: '#D6D3D1' }
              }
            >
              Todos ({products.length})
            </button>
            {activeCategories.map((cat) => {
              const active = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border shrink-0"
                  style={
                    active
                      ? { backgroundColor: primaryColor, color: primaryContrast, borderColor: primaryColor }
                      : { backgroundColor: '#FFFFFF', color: '#292524', borderColor: '#D6D3D1' }
                  }
                >
                  {cat.title}
                </button>
              );
            })}
          </div>

          {/* Product Grid */}
          {loadingCatalog ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-stone-400" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white border border-stone-200 text-center text-stone-500 text-sm font-medium">
              Nenhum item encontrado com esse filtro.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((product) => {
                const displayPrice =
                  product.hasSizes && product.sizes?.length
                    ? Math.min(...product.sizes.map((s) => s.price))
                    : product.price || product.oldPrice || 0;
                const inCartQty = cart
                  .filter((c) => c.productId === product.id)
                  .reduce((sum, c) => sum + c.quantity, 0);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleProductClick(product)}
                    className="group relative text-left rounded-2xl bg-white border border-stone-200 hover:border-stone-400 shadow-2xs hover:shadow-md transition-all p-2.5 flex flex-col gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-stone-100">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-300">
                          <ShoppingBag size={28} />
                        </div>
                      )}

                      {inCartQty > 0 && (
                        <span
                          className="absolute top-2 right-2 min-w-[26px] h-[26px] px-1.5 rounded-full text-xs font-black flex items-center justify-center shadow-md"
                          style={{ backgroundColor: primaryColor, color: primaryContrast }}
                        >
                          {inCartQty}
                        </span>
                      )}

                      {needsCustomization(product) && (
                        <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[9px] font-bold uppercase tracking-wider">
                          Opções
                        </span>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col justify-between gap-1 px-0.5">
                      <p className="font-serif font-bold text-sm leading-snug text-stone-900 line-clamp-2">
                        {product.title}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-black text-sm tabular-nums" style={{ color: primaryColor }}>
                          {product.hasSizes && product.sizes?.length ? 'a partir de ' : ''}
                          {formatMoney(displayPrice, currency)}
                        </span>
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: primaryColor, color: primaryContrast }}
                        >
                          <Plus size={15} />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Live Cashier Ticket / Comanda */}
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-[76px] rounded-3xl bg-white border border-stone-200 shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-92px)]">
            {/* Ticket Header */}
            <div className="px-4 py-3.5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-2">
                <ShoppingBag size={18} style={{ color: primaryColor }} />
                <h2 className="font-serif font-black text-base text-stone-900">
                  Pedido Atual ({cart.reduce((s, i) => s + i.quantity, 0)})
                </h2>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-[11px] font-bold text-red-600 hover:text-red-700 cursor-pointer flex items-center gap-1"
                >
                  <Trash2 size={13} /> Limpar
                </button>
              )}
            </div>

            {/* Last Order Success Banner */}
            {lastCreatedOrder && cart.length === 0 && (
              <div className="m-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-sm text-emerald-950">
                      Pedido #{lastCreatedOrder.orderNumber} registrado!
                    </p>
                    <p className="text-xs text-emerald-800">
                      {lastCreatedOrder.customerName} · {formatMoney(lastCreatedOrder.total, currency)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPrinting}
                    onClick={handlePrintLastOrder}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                    Imprimir Comanda
                  </button>
                  <button
                    type="button"
                    onClick={() => setLastCreatedOrder(null)}
                    className="py-2 px-3 rounded-xl bg-white border border-emerald-300 text-emerald-900 text-xs font-bold cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable Items + Checkout Form */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="py-10 text-center text-stone-400 space-y-2">
                  <ShoppingBag size={36} className="mx-auto opacity-40" />
                  <p className="text-sm font-semibold">Clique nos itens ao lado para montar o pedido.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cart.map((item) => {
                    const prod = products.find((p) => p.id === item.productId);
                    const unitPrice = getCartItemUnitPrice(item);
                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-stone-900 leading-tight">
                              {prod?.title || 'Item'}
                            </p>
                            {item.selectedSize && (
                              <p className="text-[11px] font-semibold text-stone-600">
                                Tamanho: {item.selectedSize.name}
                              </p>
                            )}
                            {item.sandwichOptions?.fillings?.length ? (
                              <p className="text-[11px] text-stone-600">
                                Recheios: {item.sandwichOptions.fillings.join(', ')}
                              </p>
                            ) : null}
                            {item.mealOptions?.sides?.length ? (
                              <p className="text-[11px] text-stone-600">
                                Extras: {item.mealOptions.sides.map((s) => s.name).join(', ')}
                              </p>
                            ) : null}
                            {item.mealOptions?.removals?.length ? (
                              <p className="text-[11px] text-red-600">
                                Sem: {item.mealOptions.removals.join(', ')}
                              </p>
                            ) : null}
                            {item.observation && (
                              <p className="text-[11px] italic text-stone-500">Obs: {item.observation}</p>
                            )}
                          </div>
                          <span className="font-black text-sm tabular-nums text-stone-900 shrink-0">
                            {formatMoney(unitPrice * item.quantity, currency)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-stone-500">
                            {formatMoney(unitPrice, currency)} cada
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.id, -1)}
                              className="w-7 h-7 rounded-lg bg-white border border-stone-300 flex items-center justify-center hover:bg-stone-100 cursor-pointer"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-6 text-center text-xs font-black tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.id, 1)}
                              className="w-7 h-7 rounded-lg text-white flex items-center justify-center cursor-pointer"
                              style={{ backgroundColor: primaryColor, color: primaryContrast }}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Customer, Modality & Payment Controls */}
              {cart.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-stone-200">
                  {/* Dine-In / Takeout */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderType('dine_in')}
                      className="py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      style={
                        orderType === 'dine_in'
                          ? { backgroundColor: primaryColor, color: primaryContrast, borderColor: primaryColor }
                          : { backgroundColor: '#FFFFFF', color: '#44403C', borderColor: '#D6D3D1' }
                      }
                    >
                      <UtensilsCrossed size={14} /> Comer no Local
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderType('takeout')}
                      className="py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      style={
                        orderType === 'takeout'
                          ? { backgroundColor: primaryColor, color: primaryContrast, borderColor: primaryColor }
                          : { backgroundColor: '#FFFFFF', color: '#44403C', borderColor: '#D6D3D1' }
                      }
                    >
                      <ShoppingBag size={14} /> Para Viagem
                    </button>
                  </div>

                  {/* Customer Name + Table */}
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nome do cliente (opcional)"
                      className="col-span-2 px-3 py-2 rounded-xl border border-stone-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-stone-900/15"
                    />
                    <input
                      type="text"
                      value={tableOrPager}
                      onChange={(e) => setTableOrPager(e.target.value)}
                      placeholder="Mesa/Pager"
                      className="px-3 py-2 rounded-xl border border-stone-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-stone-900/15"
                    />
                  </div>

                  <input
                    type="text"
                    value={orderObservation}
                    onChange={(e) => setOrderObservation(e.target.value)}
                    placeholder="Observação geral do pedido (opcional)"
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-stone-900/15"
                  />

                  {/* Payment Method */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                      Forma de Pagamento
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'card', label: 'Cartão', icon: CreditCard },
                          { id: 'cash', label: 'Dinheiro', icon: Banknote },
                          { id: 'venmo', label: 'Venmo', icon: Smartphone },
                          { id: 'paypal', label: 'PayPal', icon: Smartphone },
                          { id: 'cashapp', label: 'Cash App', icon: Smartphone },
                          { id: 'zelle', label: 'Zelle', icon: Smartphone },
                        ] as const
                      ).map(({ id, label, icon: Icon }) => {
                        const active = paymentMethod === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setPaymentMethod(id)}
                            className="py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                            style={
                              active
                                ? { backgroundColor: '#1C1917', color: '#FFFFFF', borderColor: '#1C1917' }
                                : { backgroundColor: '#FAFAF9', color: '#44403C', borderColor: '#D6D3D1' }
                            }
                          >
                            <Icon size={12} /> {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cash Change Calculator */}
                  {paymentMethod === 'cash' && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-bold text-amber-950">Valor recebido:</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cashReceivedInput}
                          onChange={(e) => setCashReceivedInput(e.target.value)}
                          placeholder={grandTotal.toFixed(2)}
                          className="w-28 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-right text-sm font-black tabular-nums"
                        />
                      </div>
                      {cashReceivedNum > 0 && (
                        <div className="flex items-center justify-between text-xs font-black">
                          <span className="text-amber-900">Troco a devolver:</span>
                          <span className={cashReceivedNum >= grandTotal ? 'text-emerald-700' : 'text-red-600'}>
                            {cashReceivedNum >= grandTotal
                              ? formatMoney(changeDue, currency)
                              : `Faltam ${formatMoney(grandTotal - cashReceivedNum, currency)}`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mark as Paid toggle */}
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 cursor-pointer">
                    <span className="text-xs font-bold text-emerald-950">
                      Marcar como Pago (envia direto p/ Cozinha)
                    </span>
                    <input
                      type="checkbox"
                      checked={markAsPaid}
                      onChange={(e) => setMarkAsPaid(e.target.checked)}
                      className="w-4 h-4 accent-emerald-700 cursor-pointer"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Ticket Footer Totals + Finalize CTA */}
            <div className="p-4 border-t border-stone-200 bg-stone-50 space-y-3">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span className="font-bold tabular-nums">{formatMoney(subtotal, currency)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Impostos ({taxRate}%)</span>
                    <span className="font-bold tabular-nums">{formatMoney(taxAmount, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-serif font-black text-stone-900 pt-1 border-t border-stone-200">
                  <span>Total</span>
                  <span className="tabular-nums" style={{ color: primaryColor }}>
                    {formatMoney(grandTotal, currency)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={cart.length === 0 || isSubmitting}
                onClick={handleFinalizeOrder}
                className="w-full py-3.5 rounded-2xl font-black text-sm shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.99]"
                style={{ backgroundColor: primaryColor, color: primaryContrast }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Registrando Pedido...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    {markAsPaid ? 'Finalizar e Enviar p/ Cozinha' : 'Registrar (Aguardando Pagto)'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fast Item Customization Modal for Cashier */}
      <AnimatePresence>
        {customizingProduct && (() => {
          const fillingsList = (customizingProduct.customFillings || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const maxFillings = getMaxFillingsForSize(customizingProduct, modalSize);
          const allowedSidesList = sides.filter((s) =>
            customizingProduct.allowedSides?.includes(s.id)
          );
          const ingredientsList = (customizingProduct.ingredients || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

          const basePrice = modalSize
            ? modalSize.price
            : customizingProduct.price || customizingProduct.oldPrice || 0;
          const sidesSum = modalSides.reduce((acc, s) => acc + (s.price || 0), 0);
          const itemTotal = (basePrice + sidesSum) * modalQty;

          return (
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCustomizingProduct(null)}
                className="absolute inset-0 bg-black/55 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col"
              >
                <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-serif font-black text-lg text-stone-900">
                      {customizingProduct.title}
                    </h3>
                    <p className="text-xs text-stone-500">Selecione as opções para o pedido</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomizingProduct(null)}
                    className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-5">
                  {/* Sizes */}
                  {customizingProduct.hasSizes && customizingProduct.sizes && customizingProduct.sizes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-black uppercase tracking-wider text-stone-700">
                        Tamanho / Variação
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {customizingProduct.sizes.map((sz) => {
                          const selected = modalSize?.id === sz.id;
                          return (
                            <button
                              key={sz.id}
                              type="button"
                              onClick={() => {
                                setModalSize(sz);
                                const nextMax = getMaxFillingsForSize(customizingProduct, sz);
                                setModalFillings((prev) => prev.slice(0, nextMax));
                              }}
                              className="p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between"
                              style={
                                selected
                                  ? { backgroundColor: primaryColor, color: primaryContrast, borderColor: primaryColor }
                                  : { backgroundColor: '#FAFAF9', color: '#1C1917', borderColor: '#D6D3D1' }
                              }
                            >
                              <span className="text-xs font-bold">{sz.name}</span>
                              <span className="text-xs font-black tabular-nums">
                                {formatMoney(sz.price, currency)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Fillings FIRST */}
                  {customizingProduct.isCustomSandwich && fillingsList.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-wider text-stone-700">
                          Recheios {customizingProduct.fillingsRequired !== false ? '*' : ''}
                        </p>
                        <span className="text-[11px] font-bold text-stone-500">
                          {modalFillings.length} / {maxFillings}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {fillingsList.map((filling) => {
                          const selected = modalFillings.includes(filling);
                          return (
                            <button
                              key={filling}
                              type="button"
                              onClick={() => {
                                setModalFillings((prev) => {
                                  if (prev.includes(filling)) {
                                    return prev.filter((f) => f !== filling);
                                  }
                                  if (maxFillings === 1) return [filling];
                                  if (prev.length >= maxFillings) {
                                    toast.info(`Máximo de ${maxFillings} recheio(s).`);
                                    return prev;
                                  }
                                  return [...prev, filling];
                                });
                              }}
                              className="p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer"
                              style={
                                selected
                                  ? { backgroundColor: primaryColor, color: primaryContrast, borderColor: primaryColor }
                                  : { backgroundColor: '#FFFFFF', color: '#1C1917', borderColor: '#D6D3D1' }
                              }
                            >
                              {filling}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sides / Extras */}
                  {customizingProduct.isMeal && allowedSidesList.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-black uppercase tracking-wider text-stone-700">
                        Acompanhamentos / Extras
                      </p>
                      <div className="space-y-1.5">
                        {allowedSidesList.map((side) => {
                          const qty = modalSides.filter((s) => s.id === side.id).length;
                          return (
                            <div
                              key={side.id}
                              className="p-2.5 rounded-xl border border-stone-200 flex items-center justify-between"
                            >
                              <div>
                                <p className="text-xs font-bold text-stone-900">{side.name}</p>
                                <p className="text-[11px] text-stone-500">
                                  {side.price > 0 ? `+ ${formatMoney(side.price, currency)}` : 'Grátis'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const idx = modalSides.findIndex((s) => s.id === side.id);
                                    if (idx >= 0) {
                                      setModalSides((prev) => prev.filter((_, i) => i !== idx));
                                    }
                                  }}
                                  className="w-7 h-7 rounded-full border border-stone-300 flex items-center justify-center cursor-pointer"
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="w-5 text-center text-xs font-black">{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => setModalSides((prev) => [...prev, side])}
                                  className="w-7 h-7 rounded-full text-white flex items-center justify-center cursor-pointer"
                                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Ingredient Removals */}
                  {customizingProduct.isMeal && ingredientsList.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-black uppercase tracking-wider text-stone-700">
                        Remover Ingredientes (Opcional)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ingredientsList.map((ing) => {
                          const removed = modalRemovals.includes(ing);
                          return (
                            <button
                              key={ing}
                              type="button"
                              onClick={() =>
                                setModalRemovals((prev) =>
                                  prev.includes(ing) ? prev.filter((x) => x !== ing) : [...prev, ing]
                                )
                              }
                              className="px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-all"
                              style={
                                removed
                                  ? { backgroundColor: '#DC2626', color: '#FFFFFF', borderColor: '#DC2626' }
                                  : { backgroundColor: '#FAFAF9', color: '#44403C', borderColor: '#D6D3D1' }
                              }
                            >
                              {removed ? `Sem ${ing}` : ing}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Item Observation */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-stone-700">
                      Observação do Item
                    </label>
                    <input
                      type="text"
                      value={modalObs}
                      onChange={(e) => setModalObs(e.target.value)}
                      placeholder="Ex: bem passado, molho à parte..."
                      className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-xs"
                    />
                  </div>
                </div>

                <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-xl px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center cursor-pointer"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center text-sm font-black">{modalQty}</span>
                    <button
                      type="button"
                      onClick={() => setModalQty((q) => q + 1)}
                      className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center cursor-pointer"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmCustomizedItem}
                    className="flex-1 py-3 rounded-xl font-black text-sm shadow-md cursor-pointer hover:brightness-110"
                    style={{ backgroundColor: primaryColor, color: primaryContrast }}
                  >
                    Adicionar · {formatMoney(itemTotal, currency)}
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};
