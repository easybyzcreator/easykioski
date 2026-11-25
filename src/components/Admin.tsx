import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, FIREBASE_PROJECT_ID } from '../firebase';
import { 
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, 
  query, orderBy 
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { Product, Order, Settings, Category, Side, ImageGallery, VariableCost, DeliveryRange } from '../types';
import { 
  Settings as SettingsIcon, Package, History, LogOut, Plus, Trash2, Edit2, 
  Save, X, Copy, CheckCircle2, Loader2, Layers, Image as ImageIcon,
  ArrowUp, ArrowDown, MessageCircle, MessageSquare, Calendar, Printer, Cake, Eye, EyeOff, ArrowLeft,
  DollarSign, Coins, ChevronDown, ChevronUp, Users, Download, Truck, Search, Info, Table, ShoppingBag, Calculator,
  MapPin, Navigation, ArrowUpDown, Lock, ChefHat, CreditCard, DatabaseBackup, Clock, Percent, Monitor,
  Globe, Sparkles, Smartphone, QrCode, KeyRound, Code2, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import Footer from './Footer';
import { OrdersCalendar } from './OrdersCalendar';
import { PricingAdmin } from './PricingAdmin';
import { SortMenuAdmin } from './SortMenuAdmin';
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, formatPhoneByCountry, getCleanWhatsAppPhone, getCurrencySymbol } from '../utils/countryUtils';
import { sendOrderToWhatsApp } from '../utils/orderUtils';
import { geocodeAddress } from '../utils/deliveryUtils';
import { restoreBaseCatalogToFirestore } from '../services/catalogSeedService';
import {
  BulkTranslationProgress,
  countPendingCatalogTranslations,
  translateIntroTextsAllLanguages,
  translatePendingCatalogInBulk,
  translateSingleItemAllLanguages,
} from '../services/catalogTranslationService';
import {
  generateGoogleAppsScriptCode,
  generateSecureWebhookSecret,
  sanitizeCashAppTag,
  sanitizePaypalUsername,
  sanitizeVenmoUsername,
} from '../services/appsScriptGenerator';
import { printDualOrderReceipts, triggerBrowserIframePrint } from '../services/printService';
import { formatMoney } from '../utils/kioskI18n';
import { QRCodeCanvas } from 'qrcode.react';

const getContrastText = (hexColor?: string): string => {
  if (!hexColor) return '#ffffff';
  let hex = hexColor.trim();
  if (hex.startsWith('#')) {
    hex = hex.slice(1);
  }
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const hsp = Math.sqrt(
    0.299 * (r * r) +
    0.587 * (g * g) +
    0.114 * (b * b)
  );
  return hsp > 155 ? '#000000' : '#ffffff';
};

const getColorWithLegibility = (hexColor?: string, defaultColor: string = '#865d39'): string => {
  if (!hexColor) return defaultColor;
  let hex = hexColor.trim();
  if (hex.startsWith('#')) {
    hex = hex.slice(1);
  }
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  if (hex.length !== 6) return defaultColor;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance > 0.6) {
    return defaultColor;
  }
  return `#${hex}`;
};

const handleDateMask = (value: string): string => {
  const cleanValue = value.replace(/\D/g, '').substring(0, 8);
  let formatted = '';
  if (cleanValue.length > 0) {
    formatted += cleanValue.substring(0, 2);
  }
  if (cleanValue.length > 2) {
    formatted += '/' + cleanValue.substring(2, 4);
  }
  if (cleanValue.length > 4) {
    formatted += '/' + cleanValue.substring(4, 8);
  }
  return formatted;
};

export default function Admin({
  settings,
  setSettings,
  setIsAdmin,
  initialUnlocked = false,
  onOpenKDS
}: { 
  settings: Settings, 
  setSettings: React.Dispatch<React.SetStateAction<Settings>>,
  setIsAdmin: React.Dispatch<React.SetStateAction<boolean>>,
  initialUnlocked?: boolean,
  onOpenKDS?: () => void
}) {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(initialUnlocked));
  const [password, setPassword] = useState('');
  const [isRestoringCatalog, setIsRestoringCatalog] = useState(false);
  const [isTestingDualPrint, setIsTestingDualPrint] = useState(false);

  useEffect(() => {
    if (initialUnlocked) {
      setIsLoggedIn(true);
    }
  }, [initialUnlocked]);

  const handleRestoreBaseCatalog = async () => {
    if (isRestoringCatalog) return;
    setIsRestoringCatalog(true);
    try {
      const result = await restoreBaseCatalogToFirestore();
      toast.success(
        `Catálogo base sincronizado com sucesso! (${result.categoriesCount} categorias, ${result.productsCount} produtos)`
      );
    } catch (error) {
      console.error('Erro ao restaurar catálogo base:', error);
      toast.error('Falha ao importar o catálogo base para o Firestore.');
    } finally {
      setIsRestoringCatalog(false);
    }
  };

  const handleTestDualPrint = async () => {
    if (isTestingDualPrint) return;
    setIsTestingDualPrint(true);
    try {
      const sampleOrder: Order = {
        id: 'test-dual-print',
        orderNumber: 101,
        customerName: 'Alex Morgan',
        orderType: 'dine_in',
        tableOrPager: '12',
        phone: '',
        address: 'DINE-IN',
        birthday: '',
        email: '',
        observation: 'Extra napkins please',
        items: [
          {
            title: 'Artisan Gourmet Dish',
            price: 18.5,
            quantity: 1,
            mealOptions: {
              removals: ['Onions', 'Garlic'],
              sides: [{ id: 's1', name: 'Crispy Fries', price: 3.5, type: 'side' }]
            }
          }
        ],
        subtotal: 22.0,
        taxRate: typeof settings.salesTaxRate === 'number' ? settings.salesTaxRate : 7.75,
        taxAmount: Number((22.0 * ((typeof settings.salesTaxRate === 'number' ? settings.salesTaxRate : 7.75) / 100)).toFixed(2)),
        tipPercent: 18,
        tipAmount: 3.96,
        total: Number((22.0 + 22.0 * ((typeof settings.salesTaxRate === 'number' ? settings.salesTaxRate : 7.75) / 100) + 3.96).toFixed(2)),
        paymentStatus: 'paid',
        kitchenStatus: 'preparing',
        createdAt: new Date().toISOString()
      };

      const res = await printDualOrderReceipts(sampleOrder, settings);
      if (res.mode === 'qz-tray') {
        toast.success('Via 1 (Cliente) e Via 2 (Cozinha) enviadas simultaneamente via QZ Tray!');
      } else {
        triggerBrowserIframePrint([res.customerHtml, res.kitchenHtml]);
        toast.info('QZ Tray offline — abrindo impressão combinada 80mm (Via Cliente + Via Cozinha).');
      }
    } catch (err) {
      console.error('Dual print test error:', err);
      toast.error('Erro ao testar impressão dupla 80mm.');
    } finally {
      setIsTestingDualPrint(false);
    }
  };

  const [galleryIdToDelete, setGalleryIdToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'settings' | 'menu' | 'sortMenu' | 'orders' | 'categories' | 'sides' | 'customers' | 'cakeOptions' | 'galleries' | 'finance' | 'pricing'>('orders');
  const [showFinancePeriodOrdersModal, setShowFinancePeriodOrdersModal] = useState(false);
  const [productTranslationTab, setProductTranslationTab] = useState<'en' | 'es' | 'pt'>('en');
  const [introTranslationTab, setIntroTranslationTab] = useState<'en' | 'es' | 'pt'>('en');
  const [isTranslatingIntro, setIsTranslatingIntro] = useState(false);
  const [showIntroTranslations, setShowIntroTranslations] = useState(false);
  const [showAppsScriptCode, setShowAppsScriptCode] = useState(false);
  const [isTranslatingProduct, setIsTranslatingProduct] = useState(false);
  const [isTranslatingCategory, setIsTranslatingCategory] = useState(false);
  const [isBulkTranslating, setIsBulkTranslating] = useState(false);
  const [bulkTranslationProgress, setBulkTranslationProgress] = useState<BulkTranslationProgress | null>(null);
  const [galleries, setGalleries] = useState<ImageGallery[]>([]);
  const [sides, setSides] = useState<Side[]>([]);
  const [newSide, setNewSide] = useState<Partial<Side>>({ name: '', price: 0, type: 'side' });
  const [isEditingSide, setIsEditingSide] = useState<Side | null>(null);
  const [sidePriceInput, setSidePriceInput] = useState('');
  
  // Finance States
  const [variableCosts, setVariableCosts] = useState<VariableCost[]>([]);
  const [newVarCost, setNewVarCost] = useState<Partial<VariableCost>>({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
  const [varCostAmountInput, setVarCostAmountInput] = useState('');
  const [isEditingVarCost, setIsEditingVarCost] = useState<VariableCost | null>(null);
  const [isProportionalFixed, setIsProportionalFixed] = useState<boolean>(true);

  // Finance Dates (default to start and end of current month)
  const [financeStartDate, setFinanceStartDate] = useState<string>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDay.toISOString().split('T')[0];
  });
  const [financeEndDate, setFinanceEndDate] = useState<string>(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return lastDay.toISOString().split('T')[0];
  });

  // Fixed Costs Inputs
  const [fixedRentInput, setFixedRentInput] = useState('');
  const [fixedInternetInput, setFixedInternetInput] = useState('');
  const [fixedElectricityInput, setFixedElectricityInput] = useState('');
  const [fixedWaterInput, setFixedWaterInput] = useState('');
  const [fixedGasInput, setFixedGasInput] = useState('');
  const [fixedSistemasInput, setFixedSistemasInput] = useState('');
  const [fixedMarketingInput, setFixedMarketingInput] = useState('');
  const [fixedContabilidadeInput, setFixedContabilidadeInput] = useState('');
  const [fixedSalariosInput, setFixedSalariosInput] = useState('');
  const [fixedMeiInput, setFixedMeiInput] = useState('');
  const [customFixedCosts, setCustomFixedCosts] = useState<{ label: string; amount: string }[]>([]);

  useEffect(() => {
    setFixedRentInput(settings?.fixedRent !== undefined ? settings.fixedRent.toString() : '');
    setFixedInternetInput(settings?.fixedInternet !== undefined ? settings.fixedInternet.toString() : '');
    setFixedElectricityInput(settings?.fixedElectricity !== undefined ? settings.fixedElectricity.toString() : '');
    setFixedWaterInput(settings?.fixedWater !== undefined ? settings.fixedWater.toString() : '');
    setFixedGasInput(settings?.fixedGas !== undefined ? settings.fixedGas.toString() : '');
    setFixedSistemasInput(settings?.fixedSistemas !== undefined ? settings.fixedSistemas.toString() : '');
    setFixedMarketingInput(settings?.fixedMarketing !== undefined ? settings.fixedMarketing.toString() : '');
    setFixedContabilidadeInput(settings?.fixedContabilidade !== undefined ? settings.fixedContabilidade.toString() : '');
    setFixedSalariosInput(settings?.fixedSalarios !== undefined ? settings.fixedSalarios.toString() : '');
    setFixedMeiInput(settings?.fixedMei !== undefined ? settings.fixedMei.toString() : '');
    setCustomFixedCosts(
      settings?.customFixedCosts !== undefined
        ? settings.customFixedCosts.map(item => ({ label: item.label, amount: item.amount.toString() }))
        : []
    );
    // Gera automaticamente uma chave secreta segura de webhook caso ainda esteja vazia
    if (settings && !settings.emailWebhookSecret) {
      setSettings((prev) => ({
        ...prev,
        emailWebhookSecret: generateSecureWebhookSecret(32),
      }));
    }
  }, [settings]);

  
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isGeocodingOrigin, setIsGeocodingOrigin] = useState(false);

  const [isEditingProduct, setIsEditingProduct] = useState<Product | null>(null);
  const [newProduct, setNewProduct] = useState<Omit<Product, 'id'>>({
    title: '',
    description: '',
    title_en: '',
    title_es: '',
    title_pt: '',
    description_en: '',
    description_es: '',
    description_pt: '',
    ingredients_en: '',
    ingredients_es: '',
    ingredients_pt: '',
    price: 0,
    oldPrice: 0,
    priceType: 'fixed',
    image: '',
    categoryId: '',
    isMeal: true,
    isCustomCake: false,
    isCustomSandwich: false,
    is3D: false,
    customFillings: '',
    ingredients: '',
    allowedSides: [],
    isActive: true,
    hasSizes: false,
    sizes: [],
    cakeGalleryId: '',
    nutritionalInfo: {
      calories: '',
      carbs: '',
      proteins: '',
      totalFat: '',
      saturatedFat: '',
      transFat: '',
      fiber: '',
      sodium: ''
    }
  });
  const [priceInput, setPriceInput] = useState('');
  const [sizeForm, setSizeForm] = useState({ name: '', price: '', oldPrice: '' });
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);

  const [isEditingCategory, setIsEditingCategory] = useState<Category | null>(null);
  const [newCategory, setNewCategory] = useState<{
    title: string;
    title_en: string;
    title_es: string;
    title_pt: string;
    order: number;
    catalog: 'catalog1' | 'catalog2' | 'catalog3' | 'catalog4' | 'both' | 'all' | 'catalog_b2b';
  }>({ title: '', title_en: '', title_es: '', title_pt: '', order: 0, catalog: 'catalog1' });

  const [copied, setCopied] = useState(false);
  const [copiedMobileLink, setCopiedMobileLink] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedHistoryCatalog, setSelectedHistoryCatalog] = useState<'all' | 'catalog1' | 'catalog2' | 'catalog3' | 'catalog4'>('all');
  const [filterValidatedOnly, setFilterValidatedOnly] = useState(false);
  const [orderTypeTab, setOrderTypeTab] = useState<'retail' | 'b2b'>('retail');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerChannelFilter, setCustomerChannelFilter] = useState<'all' | 'kiosk' | 'online'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showBirthdaysOnly, setShowBirthdaysOnly] = useState(false);
  const [showBatchSummary, setShowBatchSummary] = useState(false);
  const [isEditingOrder, setIsEditingOrder] = useState<Order | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = useState<any | null>(null);
  const [viewingCustomerOrders, setViewingCustomerOrders] = useState<any | null>(null);
  const [editCustomerForm, setEditCustomerForm] = useState<any>({});
  const [editOrderForm, setEditOrderForm] = useState<Partial<Order>>({});
  const [selectedProductId, setSelectedProductId] = useState('');
  const [addItemQuantity, setAddItemQuantity] = useState(1);
  const [editItemTab, setEditItemTab] = useState<'catalog' | 'custom'>('catalog');
  const [customItemTitle, setCustomItemTitle] = useState('');
  const [customItemPriceInput, setCustomItemPriceInput] = useState('');
  const [customItemQuantity, setCustomItemQuantity] = useState(1);
  const [customItemNotes, setCustomItemNotes] = useState('');

  // Min Order Comma Mask State (Imagem 6)
  const [minOrderInput, setMinOrderInput] = useState('');

  // Manual order custom item state
  const [manualItemTab, setManualItemTab] = useState<'catalog' | 'custom'>('catalog');
  const [manualCustomItemTitle, setManualCustomItemTitle] = useState('');
  const [manualCustomItemPriceInput, setManualCustomItemPriceInput] = useState('');
  const [manualCustomItemQuantity, setManualCustomItemQuantity] = useState(1);
  const [manualCustomItemNotes, setManualCustomItemNotes] = useState('');

  // Manual Clients and Manual Orders
  const [manualCustomers, setManualCustomers] = useState<any[]>([]);
  const [isRegisteringCustomer, setIsRegisteringCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState<any>({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    isB2B: false,
    managerName: '',
    frequency: '',
    address: '',
    street: '',
    number: '',
    zipCode: '',
    city: ''
  });

  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [orderCustomerSearch, setOrderCustomerSearch] = useState('');
  const [manualOrderItems, setManualOrderItems] = useState<any[]>([]);
  const [manualOrderForm, setManualOrderForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    address: '',
    street: '',
    number: '',
    zipCode: '',
    city: '',
    pickupDate: '',
    observation: '',
    birthday: ''
  });

  const [selectedManualProduct, setSelectedManualProduct] = useState<Product | null>(null);
  const [manualProductQty, setManualProductQty] = useState(1);
  const [selectedManualSize, setSelectedManualSize] = useState<any | null>(null);
  const [selectedManualMealRemovals, setSelectedManualMealRemovals] = useState<string[]>([]);
  const [selectedManualMealSides, setSelectedManualMealSides] = useState<any[]>([]);
  const [selectedManualCakeOptions, setSelectedManualCakeOptions] = useState<any>({
    size: '',
    dough: '',
    fillings: [],
    topping: '',
    topper: '',
    styleNumber: 1
  });

  const scrollToTop = () => {
    const mainContent = document.getElementById('admin-main-content');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToTop();
  }, [activeTab]);

  useEffect(() => {
    if (settings?.minOrderValue !== undefined && settings?.minOrderValue !== null) {
      setMinOrderInput(settings.minOrderValue > 0 ? settings.minOrderValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    }
  }, [settings?.minOrderValue]);

  const updateOrderFormWithItems = (updatedItems: any[]) => {
    const isCorp = editOrderForm.isB2B || editOrderForm.isPJ;
    const subtotalVal = updatedItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);
    if (isCorp) {
      setEditOrderForm({
        ...editOrderForm,
        items: updatedItems,
        total: subtotalVal,
        subtotal: subtotalVal,
        taxRate: 0,
        taxAmount: 0
      });
    } else {
      setEditOrderForm({
        ...editOrderForm,
        items: updatedItems,
        total: subtotalVal,
        subtotal: subtotalVal,
        taxRate: 0,
        taxAmount: 0
      });
    }
  };
  const [oldPriceInput, setOldPriceInput] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const uniqueCustomers = useMemo(() => {
    const customerMap = new Map<string, {
      id?: string;
      name: string;
      phone: string;
      email: string;
      birthday: string;
      address: string;
      orderLanguage?: string;
      lastOrder: any;
      totalOrders: number;
      isB2B: boolean;
      managerName: string;
      street: string;
      number: string;
      zipCode: string;
      city: string;
      frequency: string;
      orders: Order[];
      createdAt?: any;
      hasKioskOrders?: boolean;
      hasOnlineOrders?: boolean;
    }>();

    const isOrderOnlineApp = (order: Order) =>
      order.orderSource === 'mobile_pickup' ||
      order.source === 'online' ||
      (order.deliveryType === 'pickup' && Boolean(order.scheduledTime || order.pickupType));

    const isOrderKiosk = (order: Order) =>
      !isOrderOnlineApp(order) &&
      (order.orderSource === 'totem' || order.source === 'kiosk' || order.orderType === 'dine_in');

    orders.forEach(order => {
      const isCorp = !!(order.isB2B || order.isPJ);
      const name = isCorp ? (order.b2bCompanyName || order.customerName) : order.customerName;
      const phone = order.phone || '';
      const email = order.email || '';
      const key = phone || email || name;
      if (!key) return;

      const orderIsOnline = isOrderOnlineApp(order);
      const orderIsKiosk = isOrderKiosk(order);

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: name,
          phone: phone,
          email: email,
          birthday: order.birthday || '',
          address: isCorp ? (order.b2bAddress || order.address || '') : (order.address || ''),
          orderLanguage: order.orderLanguage,
          lastOrder: order.createdAt,
          totalOrders: 1,
          isB2B: isCorp,
          managerName: order.b2bManagerName || '',
          street: order.street || '',
          number: order.number || '',
          zipCode: isCorp ? (order.b2bZipCode || order.zipCode || '') : (order.zipCode || ''),
          city: isCorp ? (order.b2bCity || order.city || '') : (order.city || ''),
          frequency: order.b2bFrequency || '',
          orders: [order],
          hasKioskOrders: orderIsKiosk,
          hasOnlineOrders: orderIsOnline
        });
      } else {
        const existing = customerMap.get(key)!;
        existing.totalOrders += 1;
        existing.orders.push(order);
        if (orderIsKiosk) existing.hasKioskOrders = true;
        if (orderIsOnline) existing.hasOnlineOrders = true;
        if (isCorp) {
          existing.isB2B = true;
          if (order.b2bCompanyName) existing.name = order.b2bCompanyName;
          if (order.b2bManagerName) existing.managerName = order.b2bManagerName;
          if (order.b2bAddress) existing.address = order.b2bAddress;
          if (order.b2bZipCode) existing.zipCode = order.b2bZipCode;
          if (order.b2bCity) existing.city = order.b2bCity;
          if (order.b2bFrequency) existing.frequency = order.b2bFrequency;
        } else {
          if (order.street) existing.street = order.street;
          if (order.number) existing.number = order.number;
          if (order.zipCode) existing.zipCode = order.zipCode;
          if (order.city) existing.city = order.city;
        }
        if (order.createdAt?.toDate && existing.lastOrder?.toDate) {
          if (order.createdAt.toDate() > existing.lastOrder.toDate()) {
            existing.lastOrder = order.createdAt;
            if (!isCorp) {
              existing.name = order.customerName;
              existing.birthday = order.birthday || existing.birthday;
              existing.address = order.address || existing.address;
            }
            existing.orderLanguage = order.orderLanguage || existing.orderLanguage;
          }
        }
      }
    });

    return Array.from(customerMap.values());
  }, [orders]);

  const combinedCustomers = useMemo(() => {
    const list = [...uniqueCustomers];
    manualCustomers.forEach(mc => {
      const exists = uniqueCustomers.some(uc => {
        const ucPhoneClean = (uc.phone || '').replace(/\D/g, '');
        const mcPhoneClean = (mc.phone || '').replace(/\D/g, '');
        const hasMatchingPhone = ucPhoneClean && mcPhoneClean && ucPhoneClean === mcPhoneClean;

        const ucEmailClean = (uc.email || '').trim().toLowerCase();
        const mcEmailClean = (mc.email || '').trim().toLowerCase();
        const hasMatchingEmail = ucEmailClean && mcEmailClean && ucEmailClean === mcEmailClean;

        const ucNameClean = (uc.name || '').trim().toLowerCase();
        const mcNameClean = (mc.name || '').trim().toLowerCase();
        const hasMatchingName = ucNameClean && mcNameClean && ucNameClean === mcNameClean;

        return hasMatchingPhone || hasMatchingEmail || hasMatchingName;
      });
      if (!exists) {
        list.push({
          id: mc.id,
          name: mc.name,
          phone: mc.phone || '',
          email: mc.email || '',
          birthday: mc.birthday || '',
          address: mc.address || '',
          street: mc.street || '',
          number: mc.number || '',
          zipCode: mc.zipCode || '',
          city: mc.city || '',
          totalOrders: 0,
          isB2B: mc.isB2B || false,
          managerName: mc.managerName || '',
          frequency: mc.frequency || '',
          orders: [],
          lastOrder: null,
          createdAt: mc.createdAt || null,
          hasKioskOrders: false,
          hasOnlineOrders: false
        });
      }
    });
    return list;
  }, [uniqueCustomers, manualCustomers]);

  const slugify = (text: string) => {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-');
  };

  const handleBrandNameChange = (name: string) => {
    setSettings(prev => ({
      ...prev,
      brandName: name,
      slug: slugify(name)
    }));
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    setLoading(true);

    const unsubProducts = onSnapshot(query(collection(db, 'produtos'), orderBy('title')), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      setLoading(false);
    }, (error) => {
      console.error('Admin: Erro ao carregar produtos:', error);
      setLoading(false);
    });

    const unsubCategories = onSnapshot(query(collection(db, 'categorias'), orderBy('order', 'asc')), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    }, (error) => {
      console.error('Admin: Erro ao carregar categorias:', error);
    });

    const unsubOrders = onSnapshot(collection(db, 'pedidos'), (snapshot) => {
      const loadedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      loadedOrders.sort((a, b) => {
        const getMs = (o: Order) => {
          if (o.createdAt?.toDate) return o.createdAt.toDate().getTime();
          if (o.createdAt?.seconds) return o.createdAt.seconds * 1000;
          if (typeof o.createdAt === 'string') {
            const parsed = Date.parse(o.createdAt);
            if (!isNaN(parsed)) return parsed;
          }
          return 0;
        };
        return getMs(b) - getMs(a);
      });
      setOrders(loadedOrders);
    }, (error) => {
      console.error('Admin: Erro ao carregar pedidos:', error);
    });

    const unsubSides = onSnapshot(collection(db, 'acompanhamentos'), (snapshot) => {
      setSides(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Side)));
    }, (error) => {
      console.error('Admin: Erro ao carregar acompanhamentos:', error);
    });

    const unsubGalleries = onSnapshot(collection(db, 'galerias'), (snapshot) => {
      setGalleries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ImageGallery)));
    }, (error) => {
      console.error('Admin: Erro ao carregar galerias:', error);
    });

    const unsubVarCosts = onSnapshot(collection(db, 'custos_variaveis'), (snapshot) => {
      setVariableCosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VariableCost)));
    }, (error) => {
      console.error('Admin: Erro ao carregar custos variaveis:', error);
    });

    const unsubManualCustomers = onSnapshot(collection(db, 'clientes'), (snapshot) => {
      setManualCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Admin: Erro ao carregar clientes:', error);
    });

    return () => {
      unsubProducts();
      unsubCategories();
      unsubOrders();
      unsubSides();
      unsubGalleries();
      unsubVarCosts();
      unsubManualCustomers();
    };
  }, [isLoggedIn]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const correctPassword = settings?.adminPassword || 'admin123';
    if (password === correctPassword) {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.warn('Admin: Erro de autenticação anônima do Firebase:', error);
        // Não bloqueia o login se o provedor anônimo não estiver ativado no console do Firebase
      }
      setIsLoggedIn(true);
      toast.success('Login realizado com sucesso!');
    } else {
      toast.error('Senha incorreta!');
    }
  };

  const handleSaveFixedCosts = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updatedSettings = {
        ...settings,
        fixedRent: fixedRentInput ? parseFloat(fixedRentInput.replace(',', '.')) : undefined,
        fixedInternet: fixedInternetInput ? parseFloat(fixedInternetInput.replace(',', '.')) : undefined,
        fixedElectricity: fixedElectricityInput ? parseFloat(fixedElectricityInput.replace(',', '.')) : undefined,
        fixedWater: fixedWaterInput ? parseFloat(fixedWaterInput.replace(',', '.')) : undefined,
        fixedGas: fixedGasInput ? parseFloat(fixedGasInput.replace(',', '.')) : undefined,
        fixedSistemas: fixedSistemasInput ? parseFloat(fixedSistemasInput.replace(',', '.')) : undefined,
        fixedMarketing: fixedMarketingInput ? parseFloat(fixedMarketingInput.replace(',', '.')) : undefined,
        fixedContabilidade: fixedContabilidadeInput ? parseFloat(fixedContabilidadeInput.replace(',', '.')) : undefined,
        fixedSalarios: fixedSalariosInput ? parseFloat(fixedSalariosInput.replace(',', '.')) : undefined,
        fixedMei: fixedMeiInput ? parseFloat(fixedMeiInput.replace(',', '.')) : undefined,
        customFixedCosts: customFixedCosts
          .filter(item => item.label.trim() !== '' && item.amount.trim() !== '')
          .map(item => ({ label: item.label, amount: parseFloat(item.amount.replace(',', '.')) || 0 })),
      };

      if (fixedRentInput === '') delete updatedSettings.fixedRent;
      if (fixedInternetInput === '') delete updatedSettings.fixedInternet;
      if (fixedElectricityInput === '') delete updatedSettings.fixedElectricity;
      if (fixedWaterInput === '') delete updatedSettings.fixedWater;
      if (fixedGasInput === '') delete updatedSettings.fixedGas;
      if (fixedSistemasInput === '') delete updatedSettings.fixedSistemas;
      if (fixedMarketingInput === '') delete updatedSettings.fixedMarketing;
      if (fixedContabilidadeInput === '') delete updatedSettings.fixedContabilidade;
      if (fixedSalariosInput === '') delete updatedSettings.fixedSalarios;
      if (fixedMeiInput === '') delete updatedSettings.fixedMei;

      await setDoc(doc(db, 'configuracoes', 'geral'), updatedSettings);
      setSettings(updatedSettings);
      toast.success('Custos fixos mensais salvos com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar custos fixos:', err);
      toast.error('Erro ao salvar custos fixos.');
    }
  };

  const handleAddVarCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVarCost.description || !varCostAmountInput) {
      toast.error('Preencha a descrição e o valor do custo variável.');
      return;
    }
    const amountVal = parseFloat(varCostAmountInput.replace(',', '.'));
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Digite um valor numérico válido maior que zero.');
      return;
    }

    try {
      const dataToSave = {
        description: newVarCost.description,
        amount: amountVal,
        date: newVarCost.date || new Date().toISOString().split('T')[0]
      };

      if (isEditingVarCost) {
        await updateDoc(doc(db, 'custos_variaveis', isEditingVarCost.id), dataToSave);
        toast.success('Custo variável atualizado!');
        setIsEditingVarCost(null);
      } else {
        await addDoc(collection(db, 'custos_variaveis'), dataToSave);
        toast.success('Custo variável adicionado!');
      }

      setNewVarCost({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
      setVarCostAmountInput('');
    } catch (err) {
      console.error('Erro ao salvar custo variável:', err);
      toast.error('Erro ao salvar custo variável.');
    }
  };

  const handleDeleteVarCost = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este custo variável?')) return;
    try {
      await deleteDoc(doc(db, 'custos_variaveis', id));
      toast.success('Custo variável excluído!');
    } catch (err) {
      console.error('Erro ao excluir custo variável:', err);
      toast.error('Erro ao excluir custo variável.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void, imageType: boolean | 'logo' | 'background' | 'catalog' | 'product' | 'footerPromo' = 'product') => {
    const file = e.target.files?.[0];
    if (file) {
      // Compress image if it's too large
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          let MAX_WIDTH = 600;
          let MAX_HEIGHT = 600;
          let quality = 0.5;

          if (imageType === 'logo') {
            MAX_WIDTH = 250;
            MAX_HEIGHT = 250;
            quality = 0.6;
          } else if (imageType === 'background') {
            MAX_WIDTH = 800;
            MAX_HEIGHT = 800;
            quality = 0.4;
          } else if (imageType === 'catalog') {
            MAX_WIDTH = 450;
            MAX_HEIGHT = 450;
            quality = 0.4;
          } else if (imageType === 'footerPromo') {
            MAX_WIDTH = 720;
            MAX_HEIGHT = 900;
            quality = 0.72;
          } else if (imageType === 'product') {
            MAX_WIDTH = 600;
            MAX_HEIGHT = 600;
            quality = 0.5;
          } else if (imageType === true) {
            MAX_WIDTH = 450;
            MAX_HEIGHT = 450;
            quality = 0.4;
          } else if (imageType === false) {
            MAX_WIDTH = 600;
            MAX_HEIGHT = 600;
            quality = 0.5;
          }
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
          const isWebp = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');
          
          let compressedBase64 = '';
          if (imageType === 'footerPromo') {
            const webpData = canvas.toDataURL('image/webp', quality);
            compressedBase64 = webpData.startsWith('data:image/webp')
              ? webpData
              : canvas.toDataURL('image/jpeg', quality);
          } else if (isPng) {
            // Tenta manter transparência PNG; se ficar grande demais para o limite de 1MB do Firestore, usa WebP (com transparência) ou JPEG
            const pngData = canvas.toDataURL('image/png');
            if (pngData.length > 620_000) {
              const webpData = canvas.toDataURL('image/webp', 0.78);
              if (webpData.startsWith('data:image/webp') && webpData.length <= 650_000) {
                compressedBase64 = webpData;
              } else {
                compressedBase64 = canvas.toDataURL('image/jpeg', 0.72);
              }
            } else {
              compressedBase64 = pngData;
            }
          } else if (isWebp) {
            compressedBase64 = canvas.toDataURL('image/webp', quality);
          } else {
            compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          }

          // Garantia final: se ainda estiver acima de 720KB, comprime para JPEG mais leve para nunca estourar 1MB no Firestore
          if (compressedBase64.length > 720_000) {
            compressedBase64 = canvas.toDataURL('image/jpeg', 0.55);
          }
          callback(compressedBase64);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const addCakeOptionItem = (key: 'cakeSizes' | 'cakeDoughs' | 'cakeFillings' | 'cakeToppings' | 'cakeToppers', defaultValue: string = '') => {
    setSettings(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), defaultValue]
    }));
  };

  const removeCakeOptionItem = (key: 'cakeSizes' | 'cakeDoughs' | 'cakeFillings' | 'cakeToppings' | 'cakeToppers', index: number) => {
    setSettings(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter((_: any, i: number) => i !== index)
    }));
  };

  const updateCakeOptionItem = (key: 'cakeSizes' | 'cakeDoughs' | 'cakeFillings' | 'cakeToppings' | 'cakeToppers', index: number, value: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: (prev[key] || []).map((v: string, i: number) => i === index ? value : v)
    }));
  };

  const stripUndefinedDeep = (value: any): any => {
    if (Array.isArray(value)) {
      return value.map(stripUndefinedDeep).filter((v) => v !== undefined);
    }
    if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        if (v !== undefined) {
          const next = stripUndefinedDeep(v);
          if (next !== undefined) {
            cleaned[k] = next;
          }
        }
      }
      return cleaned;
    }
    return value;
  };

  const saveSettings = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 20000)
      );
      
      const updatedSettings = stripUndefinedDeep({
        ...settings,
        whatsappNumber: formatPhoneByCountry(settings.whatsappNumber || '', settings.whatsappCountryCode || '+1'),
        whatsappCountryCode: settings.whatsappCountryCode || '+1',
        language: settings.language || 'en',
        currency: settings.currency || 'USD',
        salesTaxRate: typeof settings.salesTaxRate === 'number' && !isNaN(settings.salesTaxRate) ? settings.salesTaxRate : 7.75,
        kioskInactivitySeconds: settings.kioskInactivitySeconds || 45,
        terminalProvider: settings.terminalProvider || 'simulation',
        defaultPrepMinutes: Number(settings.defaultPrepMinutes || 20),
        pickupOpenTime: settings.pickupOpenTime || '09:00',
        pickupCloseTime: settings.pickupCloseTime || '21:00',
        pickupSlotIntervalMinutes: Number(settings.pickupSlotIntervalMinutes || 15),
        onlinePaymentProvider: settings.onlinePaymentProvider || 'simulation'
      });

      // Se o frete estiver ativado e tiver endereço, mas não tiver coordenadas, localiza automaticamente
      if (updatedSettings.deliveryEnabled && updatedSettings.deliveryOriginAddress?.trim() && (!updatedSettings.deliveryOriginLat || !updatedSettings.deliveryOriginLng)) {
        try {
          const autoGeo = await geocodeAddress({ street: updatedSettings.deliveryOriginAddress });
          if (autoGeo) {
            updatedSettings.deliveryOriginLat = autoGeo.lat;
            updatedSettings.deliveryOriginLng = autoGeo.lng;
            setSettings(prev => ({
              ...prev,
              deliveryOriginLat: autoGeo.lat,
              deliveryOriginLng: autoGeo.lng
            }));
          }
        } catch (geoErr) {
          console.warn('Auto geocode on saveSettings failed:', geoErr);
        }
      }

      const payloadBytes = new Blob([JSON.stringify(updatedSettings)]).size;
      if (payloadBytes > 980_000) {
        toast.error('As imagens das configurações excedem o limite de 1MB do Firestore. Comprima a logo ou imagem de fundo e tente novamente.');
        return;
      }
      
      await Promise.race([
        setDoc(doc(db, 'configuracoes', 'geral'), updatedSettings, { merge: true }),
        timeoutPromise
      ]);
      
      toast.success('Configurações salvas com sucesso!');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar configurações:', err);
      const code = String(err?.code || '').toLowerCase();
      const msg = String(err?.message || '');
      if (code.includes('permission-denied') || msg.toLowerCase().includes('permission')) {
        toast.error('Permissão negada no Firebase (app-toten-ebc). Acesse Firestore Database → Regras, cole as regras e clique em PUBLICAR.');
      } else if (msg === 'Timeout') {
        toast.error('Tempo esgotado ao conectar ao Firebase. Verifique se o Firestore Database foi criado no projeto app-toten-ebc.');
      } else {
        toast.error(`Erro ao salvar configurações: ${msg || 'verifique sua conexão ou tamanho das imagens.'}`);
      }
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const handlePriceChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      setPriceInput('0,00');
      setNewProduct(prev => ({ ...prev, price: 0 }));
      return;
    }
    
    const numericValue = parseInt(digits) / 100;
    const formatted = numericValue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    setPriceInput(formatted);
    setNewProduct(prev => ({ ...prev, price: numericValue }));
  };

  const handleOldPriceChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      setOldPriceInput('0,00');
      setNewProduct(prev => ({ ...prev, oldPrice: 0 }));
      return;
    }
    
    const numericValue = parseInt(digits) / 100;
    const formatted = numericValue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    setOldPriceInput(formatted);
    setNewProduct(prev => ({ ...prev, oldPrice: numericValue }));
  };

  const handleAddSizeOption = () => {
    if (!sizeForm.name) {
      toast.error('Informe ao menos o nome do tamanho.');
      return;
    }
    const priceVal = sizeForm.price ? (parseFloat(sizeForm.price.replace(/\D/g, '')) / 100) : 0;
    
    if (editingSizeId) {
      setNewProduct((prev: any) => ({
        ...prev,
        sizes: (prev.sizes || []).map((s: any) => 
          s.id === editingSizeId ? { ...s, name: sizeForm.name, price: priceVal } : s
        )
      }));
      setEditingSizeId(null);
      setSizeForm({ name: '', price: '', oldPrice: '' });
      toast.success('Opção de tamanho atualizada!');
    } else {
      const newSizeOption = {
        id: Math.random().toString(36).substr(2, 9),
        name: sizeForm.name,
        price: priceVal
      };
      
      setNewProduct((prev: any) => ({
        ...prev,
        sizes: [...(prev.sizes || []), newSizeOption]
      }));
      
      setSizeForm({ name: '', price: '', oldPrice: '' });
      toast.success('Opção de tamanho adicionada!');
    }
  };

  const handleAutoTranslateProduct = async () => {
    const baseTitle = (newProduct.title || '').trim();
    if (!baseTitle) {
      toast.error('Digite o título do produto antes de traduzir.');
      return;
    }
    setIsTranslatingProduct(true);
    try {
      const translated = await translateSingleItemAllLanguages({
        kind: 'product',
        title: baseTitle,
        description: newProduct.description || '',
        ingredients: newProduct.ingredients || '',
      });
      setNewProduct(prev => ({
        ...prev,
        title_en: translated.title_en,
        title_es: translated.title_es,
        title_pt: translated.title_pt,
        description_en: translated.description_en,
        description_es: translated.description_es,
        description_pt: translated.description_pt,
        ingredients_en: translated.ingredients_en,
        ingredients_es: translated.ingredients_es,
        ingredients_pt: translated.ingredients_pt,
      }));
      toast.success('Traduções em EN / ES / PT geradas! Revise se desejar e salve.');
    } catch (err: any) {
      console.error('Erro ao traduzir produto:', err);
      toast.error(`Erro ao traduzir: ${err?.message || 'verifique sua conexão.'}`);
    } finally {
      setIsTranslatingProduct(false);
    }
  };

  const handleAutoTranslateCategory = async () => {
    const baseTitle = (newCategory.title || '').trim();
    if (!baseTitle) {
      toast.error('Digite o nome da categoria antes de traduzir.');
      return;
    }
    setIsTranslatingCategory(true);
    try {
      const translated = await translateSingleItemAllLanguages({
        kind: 'category',
        title: baseTitle,
      });
      setNewCategory(prev => ({
        ...prev,
        title_en: translated.title_en,
        title_es: translated.title_es,
        title_pt: translated.title_pt,
      }));
      toast.success('Traduções da categoria em EN / ES / PT geradas!');
    } catch (err: any) {
      console.error('Erro ao traduzir categoria:', err);
      toast.error(`Erro ao traduzir categoria: ${err?.message || 'verifique sua conexão.'}`);
    } finally {
      setIsTranslatingCategory(false);
    }
  };

  const handleAutoTranslateIntroTexts = async () => {
    const sub = (settings?.introSubtitle || '').trim();
    const desc = (settings?.introDescription || '').trim();
    const btn = (settings?.introButtonText || '').trim();
    const bot = (settings?.introBottomText || '').trim();
    const slg = (settings?.catalog1Slogan || settings?.slogan || '').trim();

    if (!sub && !desc && !btn && !bot && !slg) {
      toast.error('Preencha ao menos um texto da tela inicial antes de traduzir.');
      return;
    }

    setIsTranslatingIntro(true);
    try {
      const translated = await translateIntroTextsAllLanguages({
        introSubtitle: sub,
        introDescription: desc,
        introButtonText: btn,
        introBottomText: bot,
        slogan: slg,
      });
      setSettings((prev) => ({
        ...prev,
        introSubtitle_en: translated.introSubtitle_en,
        introSubtitle_es: translated.introSubtitle_es,
        introSubtitle_pt: translated.introSubtitle_pt,
        introDescription_en: translated.introDescription_en,
        introDescription_es: translated.introDescription_es,
        introDescription_pt: translated.introDescription_pt,
        introButtonText_en: translated.introButtonText_en,
        introButtonText_es: translated.introButtonText_es,
        introButtonText_pt: translated.introButtonText_pt,
        introBottomText_en: translated.introBottomText_en,
        introBottomText_es: translated.introBottomText_es,
        introBottomText_pt: translated.introBottomText_pt,
        slogan_en: translated.slogan_en,
        slogan_es: translated.slogan_es,
        slogan_pt: translated.slogan_pt,
      }));
      setShowIntroTranslations(true);
      toast.success('Textos da tela inicial traduzidos em EN / ES / PT! Clique em "Salvar Alterações" para aplicar.');
    } catch (err: any) {
      console.error('Erro ao traduzir textos da tela inicial:', err);
      toast.error(`Erro ao traduzir: ${err?.message || 'verifique sua conexão.'}`);
    } finally {
      setIsTranslatingIntro(false);
    }
  };

  const handleBulkTranslateCatalog = async () => {
    if (isBulkTranslating) return;
    const totalPending = countPendingCatalogTranslations(categories, products, sides);
    if (totalPending === 0) {
      toast.info('Todos os produtos, categorias e acompanhamentos já estão traduzidos em EN / ES / PT!');
      return;
    }
    setIsBulkTranslating(true);
    setBulkTranslationProgress({ completed: 0, total: totalPending, currentLabel: 'Preparando traduções...' });
    try {
      const { translatedCount, failedCount } = await translatePendingCatalogInBulk(
        categories,
        products,
        sides,
        (progress) => setBulkTranslationProgress(progress)
      );
      if (failedCount > 0) {
        toast.warning(`Tradução concluída: ${translatedCount} salvos e ${failedCount} falharam.`);
      } else {
        toast.success(`Sucesso! ${translatedCount} itens traduzidos e salvos no Firestore em EN / ES / PT.`);
      }
    } catch (err: any) {
      console.error('Erro na tradução em lote:', err);
      toast.error(`Erro ao traduzir em lote: ${err?.message || 'verifique sua conexão.'}`);
    } finally {
      setIsBulkTranslating(false);
      setTimeout(() => setBulkTranslationProgress(null), 3500);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newProduct.title?.trim() || !newProduct.categoryId) {
        toast.error('Por favor, preencha o título e selecione a categoria.');
        return;
      }

      setIsSaving(true);

      // Se algum dos 3 idiomas estiver vazio, gera automaticamente antes de salvar (sem bloquear se houver falha de rede na IA)
      let title_en = (newProduct.title_en || '').trim();
      let title_es = (newProduct.title_es || '').trim();
      let title_pt = (newProduct.title_pt || '').trim();
      let description_en = (newProduct.description_en || '').trim();
      let description_es = (newProduct.description_es || '').trim();
      let description_pt = (newProduct.description_pt || '').trim();
      let ingredients_en = (newProduct.ingredients_en || '').trim();
      let ingredients_es = (newProduct.ingredients_es || '').trim();
      let ingredients_pt = (newProduct.ingredients_pt || '').trim();

      const hasDesc = Boolean((newProduct.description || '').trim());
      const hasIng = Boolean((newProduct.ingredients || '').trim());
      const needsAutoTranslate =
        !title_en ||
        !title_es ||
        !title_pt ||
        (hasDesc && (!description_en || !description_es || !description_pt)) ||
        (hasIng && (!ingredients_en || !ingredients_es || !ingredients_pt));

      if (needsAutoTranslate) {
        try {
          const autoTr = await translateSingleItemAllLanguages({
            kind: 'product',
            title: newProduct.title.trim(),
            description: newProduct.description || '',
            ingredients: newProduct.ingredients || '',
          });
          if (!title_en) title_en = autoTr.title_en;
          if (!title_es) title_es = autoTr.title_es;
          if (!title_pt) title_pt = autoTr.title_pt;
          if (hasDesc) {
            if (!description_en) description_en = autoTr.description_en;
            if (!description_es) description_es = autoTr.description_es;
            if (!description_pt) description_pt = autoTr.description_pt;
          }
          if (hasIng) {
            if (!ingredients_en) ingredients_en = autoTr.ingredients_en;
            if (!ingredients_es) ingredients_es = autoTr.ingredients_es;
            if (!ingredients_pt) ingredients_pt = autoTr.ingredients_pt;
          }
        } catch (trErr) {
          console.warn('Auto-tradução ao salvar produto falhou; salvando mesmo assim:', trErr);
        }
      }

      const safePrice = Number.isFinite(Number(newProduct.price)) ? Number(newProduct.price) : 0;
      const safeOldPrice = Number.isFinite(Number(newProduct.oldPrice)) ? Number(newProduct.oldPrice) : 0;
      // Se o admin preencheu apenas Preço Original (De) e deixou Promocional zerado, assume esse valor como preço principal para evitar produto sem preço
      const effectivePrice = safePrice > 0 ? safePrice : safeOldPrice;
      const effectiveOldPrice = safePrice > 0 && safeOldPrice > safePrice ? safeOldPrice : 0;

      const productPayload = stripUndefinedDeep({
        ...newProduct,
        title: newProduct.title.trim(),
        description: (newProduct.description || '').trim(),
        ingredients: (newProduct.ingredients || '').trim(),
        price: effectivePrice,
        oldPrice: effectiveOldPrice,
        title_en: title_en || newProduct.title.trim(),
        title_es: title_es || newProduct.title.trim(),
        title_pt: title_pt || newProduct.title.trim(),
        description_en,
        description_es,
        description_pt,
        ingredients_en,
        ingredients_es,
        ingredients_pt,
        translations: {
          en: { title: title_en || newProduct.title.trim(), description: description_en },
          es: { title: title_es || newProduct.title.trim(), description: description_es },
          pt: { title: title_pt || newProduct.title.trim(), description: description_pt },
        },
        isActive: isEditingProduct ? (newProduct.isActive ?? true) : true,
      });

      const payloadBytes = new Blob([JSON.stringify(productPayload)]).size;
      if (payloadBytes > 980_000) {
        toast.error('A imagem deste produto excede o limite de 1MB do Firebase. Escolha uma foto mais leve e tente novamente.');
        return;
      }

      if (isEditingProduct) {
        await setDoc(doc(db, 'produtos', isEditingProduct.id), productPayload, { merge: true });
        setIsEditingProduct(null);
        toast.success('Produto atualizado com sucesso!');
      } else {
        await addDoc(collection(db, 'produtos'), productPayload);
        toast.success('Produto adicionado com sucesso!');
      }
      setNewProduct({ 
        title: '', 
        description: '', 
        title_en: '',
        title_es: '',
        title_pt: '',
        description_en: '',
        description_es: '',
        description_pt: '',
        ingredients_en: '',
        ingredients_es: '',
        ingredients_pt: '',
        price: 0, 
        priceType: 'fixed',
        image: '', 
        categoryId: '',
        isMeal: true,
        isCustomCake: false,
        isCustomSandwich: false,
        is3D: false,
        customFillings: '',
        ingredients: '',
        allowedSides: [],
        isActive: true,
        oldPrice: 0,
        hasSizes: false,
        sizes: [],
        cakeGalleryId: '',
        nutritionalInfo: {
          calories: '',
          carbs: '',
          proteins: '',
          totalFat: '',
          saturatedFat: '',
          transFat: '',
          fiber: '',
          sodium: ''
        }
      });
      setPriceInput('');
      setOldPriceInput('');
      setEditingSizeId(null);
      setSizeForm({ name: '', price: '', oldPrice: '' });
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err);
      const code = String(err?.code || '').toLowerCase();
      const msg = String(err?.message || '');
      if (code.includes('permission-denied') || msg.toLowerCase().includes('permission')) {
        toast.error('Permissão negada no Firebase. Verifique as regras publicadas no Firestore.');
      } else if (msg.toLowerCase().includes('longer than') || msg.toLowerCase().includes('exceeds the maximum')) {
        toast.error('A imagem do produto ficou acima de 1MB. Tente selecionar uma foto menor.');
      } else {
        toast.error(`Erro ao salvar produto: ${msg || 'verifique sua conexão.'}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProductStatus = async (product: Product) => {
    try {
      await updateDoc(doc(db, 'produtos', product.id), {
        isActive: product.isActive === false ? true : false
      });
    } catch (err) {
      alert('Erro ao alterar status do produto.');
    }
  };

  const moveCategory = async (id: string, direction: 'up' | 'down') => {
    const index = categories.findIndex(c => c.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === categories.length - 1) return;

    const otherIndex = direction === 'up' ? index - 1 : index + 1;
    const current = categories[index];
    const other = categories[otherIndex];

    const currentOrder = current.order ?? index;
    const otherOrder = other.order ?? otherIndex;

    let newCurrentOrder = otherOrder;
    let newOtherOrder = currentOrder;

    if (newCurrentOrder === newOtherOrder) {
      if (direction === 'up') {
        newCurrentOrder = newOtherOrder - 1;
      } else {
        newCurrentOrder = newOtherOrder + 1;
      }
    }

    await updateDoc(doc(db, 'categorias', current.id), { order: newCurrentOrder });
    await updateDoc(doc(db, 'categorias', other.id), { order: newOtherOrder });
  };

  const handleAddSide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSide.name) return;

    try {
      if (isEditingSide) {
        await updateDoc(doc(db, 'acompanhamentos', isEditingSide.id), newSide);
        toast.success('Acompanhamento atualizado!');
      } else {
        await addDoc(collection(db, 'acompanhamentos'), newSide);
        toast.success('Acompanhamento adicionado!');
      }
      setNewSide({ name: '', price: 0, type: 'side' });
      setSidePriceInput('');
      setIsEditingSide(null);
    } catch (error) {
      console.error('Error adding side:', error);
      toast.error('Erro ao salvar acompanhamento');
    }
  };

  const deleteSide = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Acompanhamento',
      message: 'Tem certeza que deseja excluir este acompanhamento?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'acompanhamentos', id));
          toast.success('Acompanhamento excluído!');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          toast.error('Erro ao excluir');
        }
      }
    });
  };

  const handleSidePriceChange = (val: string) => {
    setSidePriceInput(val);
    const numeric = parseFloat(val.replace(',', '.'));
    if (!isNaN(numeric)) {
      setNewSide({ ...newSide, price: numeric });
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newCategory.title?.trim()) {
        toast.error('Por favor, preencha o título da categoria.');
        return;
      }

      let title_en = (newCategory.title_en || '').trim();
      let title_es = (newCategory.title_es || '').trim();
      let title_pt = (newCategory.title_pt || '').trim();

      if (!title_en || !title_es || !title_pt) {
        try {
          const autoTr = await translateSingleItemAllLanguages({
            kind: 'category',
            title: newCategory.title.trim(),
          });
          if (!title_en) title_en = autoTr.title_en;
          if (!title_es) title_es = autoTr.title_es;
          if (!title_pt) title_pt = autoTr.title_pt;
        } catch (trErr) {
          console.warn('Auto-tradução da categoria falhou; salvando mesmo assim:', trErr);
        }
      }

      const categoryData = stripUndefinedDeep({
        title: newCategory.title.trim(),
        title_en: title_en || newCategory.title.trim(),
        title_es: title_es || newCategory.title.trim(),
        title_pt: title_pt || newCategory.title.trim(),
        translations: {
          en: { title: title_en || newCategory.title.trim() },
          es: { title: title_es || newCategory.title.trim() },
          pt: { title: title_pt || newCategory.title.trim() },
        },
        catalog: newCategory.catalog || 'both',
      });

      if (isEditingCategory) {
        await setDoc(doc(db, 'categorias', isEditingCategory.id), categoryData, { merge: true });
        setIsEditingCategory(null);
        toast.success('Categoria atualizada com sucesso!');
      } else {
        const maxOrder = categories.reduce((max, c) => Math.max(max, c.order || 0), 0);
        await addDoc(collection(db, 'categorias'), {
          ...categoryData,
          order: maxOrder + 1,
        });
        toast.success('Categoria adicionada com sucesso!');
      }
      setNewCategory({ title: '', title_en: '', title_es: '', title_pt: '', order: 0, catalog: 'both' });
    } catch (err: any) {
      console.error('Erro ao salvar categoria:', err);
      if (err.message?.includes('permission-denied')) {
        toast.error('Erro de permissão: Você não tem autorização para salvar. Verifique se está logado corretamente.');
      } else {
        toast.error('Erro ao salvar categoria. Verifique sua conexão.');
      }
    }
  };

  const deleteProduct = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Produto',
      message: 'Deseja realmente excluir este produto? Esta ação não pode ser desfeita.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'produtos', id));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          alert('Erro ao excluir produto.');
        }
      }
    });
  };

  const deleteCategory = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Categoria',
      message: 'Deseja realmente excluir esta categoria? Todos os produtos vinculados a ela ficarão sem categoria.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'categorias', id));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          alert('Erro ao excluir categoria.');
        }
      }
    });
  };

  const deleteOrder = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Pedido',
      message: 'Deseja realmente excluir este pedido do histórico?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'pedidos', id));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          alert('Erro ao excluir pedido.');
        }
      }
    });
  };

  const updateOrderPaymentStatus = async (orderId: string, status: 'pending' | 'half' | 'full' | 'paid') => {
    try {
      await updateDoc(doc(db, 'pedidos', orderId), {
        paymentStatus: status
      });
      toast.success('Status de pagamento atualizado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar status de pagamento.');
    }
  };

  const deleteCustomer = async (customer: any) => {
    const customerId = customer.phone || customer.email || customer.name;
    const customerOrders = orders.filter(o => (o.phone || o.email || o.customerName) === customerId);
    
    try {
      setIsSaving(true);
      if (customer.id) {
        await deleteDoc(doc(db, 'clientes', customer.id));
      }
      for (const order of customerOrders) {
        await deleteDoc(doc(db, 'pedidos', order.id));
      }
      toast.success('Cliente e seus pedidos excluídos com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      toast.error('Erro ao excluir cliente');
    } finally {
      setIsSaving(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  const updateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const originalId = isEditingCustomer.phone || isEditingCustomer.email || isEditingCustomer.name;
    const customerOrders = orders.filter(o => {
      return o.customerName === originalId || o.phone === originalId || o.email === originalId;
    });

    try {
      setIsSaving(true);
      
      const fullAddr = `${editCustomerForm.street || ''}, ${editCustomerForm.number || 'S/N'} - ${editCustomerForm.city || ''} (${editCustomerForm.zipCode || ''})`;

      if (isEditingCustomer.id) {
        const mcDocRef = doc(db, 'clientes', isEditingCustomer.id);
        await updateDoc(mcDocRef, {
          name: editCustomerForm.name,
          phone: editCustomerForm.phone,
          email: editCustomerForm.email,
          birthday: editCustomerForm.birthday || '',
          isB2B: false,
          managerName: '',
          frequency: '',
          address: fullAddr,
          street: editCustomerForm.street || '',
          number: editCustomerForm.number || '',
          zipCode: editCustomerForm.zipCode || '',
          city: editCustomerForm.city || ''
        });
      }

      for (const order of customerOrders) {
        const updateData: any = {
          phone: editCustomerForm.phone,
          email: editCustomerForm.email,
          birthday: editCustomerForm.birthday || '',
          customerName: editCustomerForm.name,
          street: editCustomerForm.street || '',
          number: editCustomerForm.number || '',
          zipCode: editCustomerForm.zipCode || '',
          city: editCustomerForm.city || '',
          address: fullAddr
        };

        await updateDoc(doc(db, 'pedidos', order.id), updateData);
      }
      toast.success('Informações do cliente atualizadas!');
      setIsEditingCustomer(null);
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      toast.error('Erro ao atualizar cliente');
    } finally {
      setIsSaving(false);
    }
  };

  const saveNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerForm.name) {
      toast.error('O nome do cliente é obrigatório.');
      return;
    }
    try {
      setIsSaving(true);
      const fullAddr = `${newCustomerForm.street || ''}, ${newCustomerForm.number || 'S/N'} - ${newCustomerForm.city || ''} (${newCustomerForm.zipCode || ''})`;

      const clientData = {
        name: newCustomerForm.name,
        phone: newCustomerForm.phone || '',
        email: newCustomerForm.email || '',
        birthday: newCustomerForm.birthday || '',
        isB2B: false,
        managerName: '',
        frequency: '',
        address: fullAddr,
        street: newCustomerForm.street || '',
        number: newCustomerForm.number || '',
        zipCode: newCustomerForm.zipCode || '',
        city: newCustomerForm.city || '',
        createdAt: new Date()
      };

      await addDoc(collection(db, 'clientes'), clientData);
      toast.success('Cliente cadastrado com sucesso!');
      setIsRegisteringCustomer(false);
    } catch (error) {
      console.error('Erro ao cadastrar cliente:', error);
      toast.error('Erro ao cadastrar cliente');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddManualItem = () => {
    if (!selectedManualProduct) {
      toast.error('Por favor, selecione um produto.');
      return;
    }

    let finalPrice = selectedManualProduct.price;
    let titleDetail = selectedManualProduct.title;
    let itemSize: any = null;

    if (selectedManualProduct.hasSizes && selectedManualProduct.sizes && selectedManualProduct.sizes.length > 0) {
      if (!selectedManualSize) {
        toast.error('Por favor, selecione um tamanho/variação.');
        return;
      }
      finalPrice = selectedManualSize.price;
      titleDetail = `${selectedManualProduct.title} (${selectedManualSize.name})`;
      itemSize = selectedManualSize;
    }

    const mealOpts: any = {};
    if (selectedManualProduct.isMeal) {
      mealOpts.removals = selectedManualMealRemovals;
      mealOpts.sides = selectedManualMealSides;
      if (selectedManualMealRemovals.length > 0) {
        titleDetail += ` [Sem: ${selectedManualMealRemovals.join(', ')}]`;
      }
      if (selectedManualMealSides.length > 0) {
        titleDetail += ` [Acomp: ${selectedManualMealSides.map(s => s.name).join(', ')}]`;
      }
    }

    const cakeOpts: any = {};
    if (selectedManualProduct.isCustomCake) {
      cakeOpts.size = selectedManualCakeOptions.size;
      cakeOpts.dough = selectedManualCakeOptions.dough;
      cakeOpts.fillings = selectedManualCakeOptions.fillings;
      cakeOpts.topping = selectedManualCakeOptions.topping;
      cakeOpts.topper = selectedManualCakeOptions.topper;
      cakeOpts.styleNumber = selectedManualCakeOptions.styleNumber;

      titleDetail += ` [Bolo: ${cakeOpts.size || ''}, ${cakeOpts.dough || ''}, Recheio: ${(cakeOpts.fillings || []).join(' e ')}]`;
    }

    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: selectedManualProduct.id,
      title: titleDetail,
      quantity: manualProductQty,
      price: finalPrice,
      priceType: selectedManualProduct.priceType || 'fixed',
      mealOptions: selectedManualProduct.isMeal ? mealOpts : undefined,
      selectedSize: itemSize || undefined,
      cakeOptions: selectedManualProduct.isCustomCake ? cakeOpts : undefined,
    };

    setManualOrderItems([...manualOrderItems, newItem]);

    setSelectedManualProduct(null);
    setManualProductQty(1);
    setSelectedManualSize(null);
    setSelectedManualMealRemovals([]);
    setSelectedManualMealSides([]);
    setSelectedManualCakeOptions({
      size: '',
      dough: '',
      fillings: [],
      topping: '',
      topper: '',
      styleNumber: 1
    });
    toast.success('Item adicionado ao pedido!');
  };

  const handleCreateManualOrder = async () => {
    if (manualOrderItems.length === 0) {
      toast.error('Adicione pelo menos um item ao pedido.');
      return;
    }
    if (!manualOrderForm.customerName) {
      toast.error('O nome do cliente é obrigatório.');
      return;
    }

    try {
      setIsSaving(true);
      const total = manualOrderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

      const orderData = {
        customerName: manualOrderForm.customerName,
        phone: manualOrderForm.phone || '',
        email: manualOrderForm.email || '',
        address: manualOrderForm.address || '',
        street: manualOrderForm.street || '',
        number: manualOrderForm.number || '',
        zipCode: manualOrderForm.zipCode || '',
        city: manualOrderForm.city || '',
        birthday: manualOrderForm.birthday || '',
        pickupDate: manualOrderForm.pickupDate || '',
        observation: manualOrderForm.observation || '',
        items: manualOrderItems.map(item => ({
          title: item.title,
          quantity: item.quantity,
          price: item.price,
          priceType: item.priceType || 'fixed',
          mealOptions: item.mealOptions || null,
          selectedSize: item.selectedSize || null,
          cakeOptions: item.cakeOptions || null
        })),
        total: total,
        subtotal: total,
        createdAt: new Date(),
        orderLanguage: settings?.language || 'pt'
      };

      await addDoc(collection(db, 'pedidos'), orderData);
      toast.success('Pedido manual cadastrado com sucesso!');
      setIsAddingOrder(false);
      setManualOrderItems([]);
      setManualOrderForm({
        customerName: '',
        phone: '',
        email: '',
        address: '',
        street: '',
        number: '',
        zipCode: '',
        city: '',
        pickupDate: '',
        observation: '',
        birthday: ''
      });
    } catch (error) {
      console.error('Erro ao cadastrar pedido manual:', error);
      toast.error('Erro ao cadastrar pedido manual');
    } finally {
      setIsSaving(false);
    }
  };

  const closestUpcomingOrder = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseDateString = (str: string, lang?: string) => {
      if (!str || !str.includes('/')) return null;
      const parts = str.split('/');
      if (parts.length !== 3) return null;
      
      let month = parseInt(parts[0]);
      let day = parseInt(parts[1]);
      let year = parseInt(parts[2]);

      // Always treat as MM/DD/YYYY by default (USA pattern), but if the first part (month) is > 12, it is definitely DD/MM/YYYY
      if (month > 12) {
        day = parseInt(parts[0]);
        month = parseInt(parts[1]);
      }
      
      if (!day || !month || !year || month > 12) return null;
      return new Date(year, month - 1, day);
    };

    const upcomingOrders = orders
      .map(o => {
        if (!o.pickupDate) return null;
        const d = parseDateString(o.pickupDate, o.orderLanguage || settings.language || 'pt');
        if (!d) return null;
        d.setHours(0, 0, 0, 0);
        return { order: o, date: d };
      })
      .filter((item): item is { order: Order; date: Date } => item !== null && item.date >= today);

    if (upcomingOrders.length === 0) {
      // If none are in the future, get the closest one overall that has a pickupDate
      const allWithDate = orders
        .map(o => {
          if (!o.pickupDate) return null;
          const d = parseDateString(o.pickupDate, o.orderLanguage || settings.language || 'pt');
          if (!d) return null;
          d.setHours(0, 0, 0, 0);
          return { order: o, date: d };
        })
        .filter((item): item is { order: Order; date: Date } => item !== null);
      
      if (allWithDate.length === 0) return null;
      
      allWithDate.sort((a, b) => b.date.getTime() - a.date.getTime());
      return allWithDate[0].order;
    }

    upcomingOrders.sort((a, b) => a.date.getTime() - b.date.getTime());
    return upcomingOrders[0].order;
  }, [orders, settings.language]);

  const printWithIframe = (htmlContent: string) => {
    let iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
    if (iframe) {
      document.body.removeChild(iframe);
    }

    iframe = document.createElement('iframe');
    iframe.id = 'print-iframe';
    iframe.setAttribute('style', 'position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0;');
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) return;

    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    setTimeout(() => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
    }, 250);
  };

  const printOrdersList = () => {
    const listTitle = orderTypeTab === 'b2b' 
      ? 'PEDIDOS CORPORATIVOS (B2B)' 
      : 'PEDIDOS VAREJO';

    const contentHtml = filteredOrders.map((order, index) => {
      const itemsText = order.items.map(item => `  ${item.quantity}x ${item.title}${item.selectedSize ? ` (${item.selectedSize.name})` : ''}`).join('\n');
      const name = order.isB2B || order.isPJ ? (order.b2bCompanyName || order.customerName) : order.customerName;
      const deliveryDate = order.pickupDate ? order.pickupDate : 'N/A';
      
      return `
        <div class="order-block">
          <div class="order-header">#${index + 1} - ${name.toUpperCase()}</div>
          <div class="order-details">
            TEL: ${order.phone}<br/>
            ENTREGA: ${deliveryDate}
          </div>
          <div class="order-items">${itemsText}</div>
          <div class="order-total">TOTAL: ${currencySymbol} ${order.total.toFixed(2).replace('.', ',')}</div>
        </div>
      `;
    }).join('');

    const totalSum = filteredOrders.reduce((sum, o) => sum + o.total, 0);

    printWithIframe(`
      <html>
        <head>
          <title>${listTitle}</title>
          <style>
            @page { size: 76mm auto; margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 63.5mm; 
              padding: 2mm; 
              margin: 0; 
              font-size: 11px; 
              color: #000;
              line-height: 1.3;
            }
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 5px; margin-bottom: 10px; }
            .header h1 { font-size: 13px; margin: 0 0 3px 0; text-transform: uppercase; }
            .header p { font-size: 9px; margin: 0; }
            .order-block { margin-bottom: 12px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
            .order-header { font-weight: bold; font-size: 12px; }
            .order-details { font-size: 10px; margin: 2px 0; }
            .order-items { white-space: pre-wrap; font-size: 11px; margin: 4px 0; background: #fafafa; padding: 2px; }
            .order-total { text-align: right; font-weight: bold; font-size: 11px; }
            .total-sum { font-size: 13px; font-weight: bold; text-align: right; border-top: 2px solid #000; padding-top: 5px; margin-top: 10px; text-transform: uppercase; }
            @media print {
              body { width: 63.5mm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${listTitle}</h1>
            <p>Gerado em: ${new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            <p>Total de Pedidos: ${filteredOrders.length}</p>
          </div>
          ${contentHtml || '<div style="text-align: center; padding: 15px; color: #666;">Nenhum pedido encontrado.</div>'}
          <div class="total-sum">
            SOMA TOTAL: ${currencySymbol} ${totalSum.toFixed(2).replace('.', ',')}
          </div>
        </body>
      </html>
    `);
  };

  const printAllProductsList = () => {
    const groupedProducts = categories.map(cat => {
      const catProducts = products.filter(p => p.categoryId === cat.id);
      return {
        categoryTitle: cat.title,
        products: catProducts
      };
    }).filter(group => group.products.length > 0);

    const uncategorizedProducts = products.filter(p => !p.categoryId || !categories.some(cat => cat.id === p.categoryId));
    if (uncategorizedProducts.length > 0) {
      groupedProducts.push({
        categoryTitle: 'Sem Categoria',
        products: uncategorizedProducts
      });
    }

    const contentHtml = groupedProducts.map(group => {
      const productsHtml = group.products.map((product, idx) => {
        let priceStr = '';
        if (product.hasSizes && product.sizes && product.sizes.length > 0) {
          priceStr = product.sizes.map(s => `  - ${s.name}: ${currencySymbol} ${Number(s.price).toFixed(2).replace('.', ',')}`).join('\n');
        } else {
          priceStr = `  ${currencySymbol} ${Number(product.price || 0).toFixed(2).replace('.', ',')}`;
          if (product.oldPrice) {
            priceStr += ` (De: ${currencySymbol} ${Number(product.oldPrice).toFixed(2).replace('.', ',')})`;
          }
        }

        let catalogLabel = '';
        if (product.catalog === 'catalog1') {
          catalogLabel = settings?.catalog1Title || 'Catálogo 1';
        } else if (product.catalog === 'catalog2') {
          catalogLabel = settings?.catalog2Title || 'Catálogo 2';
        } else if (product.catalog === 'catalog3') {
          catalogLabel = settings?.catalog3Title || 'Catálogo 3';
        } else if (product.catalog === 'catalog4') {
          catalogLabel = settings?.catalog4Title || 'Catálogo 4';
        } else if (product.catalog === 'all') {
          catalogLabel = 'Todos';
        }

        const activeStatusText = product.isActive !== false ? 'ATIVO' : 'INATIVO';

        return `
          <div class="product-block">
            <div class="product-title">${idx + 1}. ${product.title.toUpperCase()} [${activeStatusText}]</div>
            ${product.description ? `<div class="product-desc">${product.description}</div>` : ''}
            ${catalogLabel ? `<div class="product-catalog">Catálogo: ${catalogLabel}</div>` : ''}
            <div class="product-price">${priceStr}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="category-block">
          <div class="category-title">${group.categoryTitle.toUpperCase()}</div>
          ${productsHtml}
        </div>
      `;
    }).join('');

    printWithIframe(`
      <html>
        <head>
          <title>Cardápio Completo</title>
          <style>
            @page { size: 76mm auto; margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 63.5mm; 
              padding: 2mm; 
              margin: 0; 
              font-size: 11px; 
              color: #000;
              line-height: 1.3;
            }
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 5px; margin-bottom: 10px; }
            .header h1 { font-size: 13px; margin: 0 0 3px 0; text-transform: uppercase; }
            .header p { font-size: 9px; margin: 0; }
            .category-block { margin-top: 10px; }
            .category-title { font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 5px; text-transform: uppercase; }
            .product-block { margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
            .product-title { font-weight: bold; font-size: 11px; }
            .product-desc { font-size: 10px; color: #444; margin: 2px 0; }
            .product-catalog { font-size: 10px; font-style: italic; }
            .product-price { font-weight: bold; font-size: 11px; white-space: pre-wrap; margin-top: 2px; }
            @media print {
              body { width: 63.5mm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${settings?.brandName || 'Escola de gastronomia e negócios'}</h1>
            <p>Relatório de Produtos do Cardápio</p>
            <p>Gerado em: ${new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            <p>Total de Produtos: ${products.length}</p>
          </div>
          ${contentHtml || '<div style="text-align: center; padding: 15px; color: #666;">Nenhum produto cadastrado.</div>'}
        </body>
      </html>
    `);
  };

  const printProductionSummary = () => {
    const listTitle = orderTypeTab === 'b2b'
      ? 'RESUMO PRODUÇÃO - B2B'
      : 'RESUMO PRODUÇÃO - VAREJO';

    const itemsHtml = Object.entries(batchSummary.items).map(([title, qty]) => `
      <div class="summary-row">
        <span class="title">${title}</span>
        <span class="qty">${qty}x</span>
      </div>
    `).join('');

    const sidesHtml = Object.entries(batchSummary.sides).map(([name, qty]) => `
      <div class="summary-row">
        <span class="title">${name}</span>
        <span class="qty">${qty}x</span>
      </div>
    `).join('');

    const dateRangeText = (startDate || endDate) 
      ? `Período: ${startDate || 'Início'} até ${endDate || 'Fim'}`
      : 'Todos os Pedidos';

    printWithIframe(`
      <html>
        <head>
          <title>${listTitle}</title>
          <style>
            @page { size: 76mm auto; margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 63.5mm; 
              padding: 2mm; 
              margin: 0; 
              font-size: 11px; 
              color: #000;
              line-height: 1.3;
            }
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 5px; margin-bottom: 10px; }
            .header h1 { font-size: 13px; margin: 0 0 3px 0; text-transform: uppercase; }
            .header p { font-size: 9px; margin: 0; }
            .section { margin-bottom: 12px; }
            .section-title { font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 5px; text-transform: uppercase; }
            .summary-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #ccc; }
            .summary-row .title { max-width: 80%; }
            .summary-row .qty { font-weight: bold; }
            @media print {
              body { width: 63.5mm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${listTitle}</h1>
            <p>${dateRangeText}</p>
            <p>Gerado em: ${new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          
          <div class="section">
            <div class="section-title">📦 TOTAL DE ITENS</div>
            <div>
              ${itemsHtml || '<div style="text-align: center; padding: 5px; color: #666;">Nenhum item no período.</div>'}
            </div>
          </div>

          <div class="section">
            <div class="section-title">➕ ACOMPANHAMENTOS</div>
            <div>
              ${sidesHtml || '<div style="text-align: center; padding: 5px; color: #666;">Nenhum acompanhamento.</div>'}
            </div>
          </div>
        </body>
      </html>
    `);
  };

  const handleEditOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditingOrder) return;
    try {
      await updateDoc(doc(db, 'pedidos', isEditingOrder.id), editOrderForm);
      setIsEditingOrder(null);
    } catch (err) {
      alert('Erro ao atualizar pedido.');
    }
  };

  const toggleOrder = (orderId: string) => {
    setExpandedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId) 
        : [...prev, orderId]
    );
  };

  const copyLink = () => {
    const url = `${window.location.origin}/?slug=${settings?.slug || 'easy-menu'}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const printOrder = (order: Order) => {
    const dateStr = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
    
    let itemsHtml = order.items.map(item => {
      let optionsHtml = '';
      if (item.cakeOptions && (item.cakeOptions.size || item.cakeOptions.dough || item.cakeOptions.fillings)) {
        optionsHtml = `
          <div class="item-sub">
            ${item.cakeOptions.size ? `<div>TAMANHO: ${item.cakeOptions.size}</div>` : ''}
            ${item.cakeOptions.dough ? `<div>MASSA: ${item.cakeOptions.dough}</div>` : ''}
            ${item.cakeOptions.fillings && item.cakeOptions.fillings.length > 0 ? `<div>RECHEIOS: ${item.cakeOptions.fillings.join(', ')}</div>` : ''}
            ${item.cakeOptions.topping ? `<div>COBERTURA: ${item.cakeOptions.topping}</div>` : ''}
            ${item.cakeOptions.topper ? `<div>TOPPER: ${item.cakeOptions.topper}</div>` : ''}
          </div>
        `;
      } else if (item.sandwichOptions && item.sandwichOptions.fillings && item.sandwichOptions.fillings.length > 0) {
        optionsHtml = `
          <div class="item-sub">
            <div>RECHEIOS: ${item.sandwichOptions.fillings.join(', ')}</div>
          </div>
        `;
      } else if (item.mealOptions) {
        optionsHtml = `
          <div class="item-sub">
            ${item.mealOptions.removals.length > 0 ? `<div>REMOVER: ${item.mealOptions.removals.join(', ')}</div>` : ''}
            ${item.mealOptions.sides.length > 0 ? `<div>ACOMPANHAMENTOS: ${item.mealOptions.sides.map(s => s.name).join(', ')}</div>` : ''}
          </div>
        `;
      }

      return `
        <div class="item-row">
          <div class="item-main">
            <span>${item.quantity}x ${item.title.toUpperCase()}${item.selectedSize ? ` (${item.selectedSize.name.toUpperCase()})` : ''}</span>
            <span>${currencySymbol} ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
          </div>
          ${optionsHtml}
        </div>
      `;
    }).join('');

    printWithIframe(`
      <html>
        <head>
          <title>Comanda - ${order.customerName}</title>
          <style>
            @page { size: 76mm auto; margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 63.5mm; 
              padding: 2mm; 
              margin: 0; 
              font-size: 11px; 
              color: #000;
              line-height: 1.3;
            }
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 5px; margin-bottom: 8px; }
            .header h2 { margin: 0; font-size: 13px; text-transform: uppercase; }
            .header p { margin: 2px 0 0 0; font-size: 9px; }
            .section { margin-bottom: 6px; }
            .label { font-weight: bold; font-size: 10px; text-transform: uppercase; }
            .value { font-size: 11px; margin-top: 1px; }
            .item-row { border-bottom: 1px dashed #000; padding: 4px 0; font-size: 11px; }
            .item-main { display: flex; justify-content: space-between; font-weight: bold; }
            .item-sub { font-size: 9px; color: #333; padding-left: 8px; margin-top: 2px; line-height: 1.2; }
            .divider { border-top: 1px solid #000; margin: 5px 0; }
            .double-divider { border-top: 3px double #000; margin: 5px 0; }
            .total-section { text-align: right; font-size: 10px; margin-top: 6px; }
            .total { text-align: right; font-weight: bold; font-size: 13px; margin-top: 4px; text-transform: uppercase; border-top: 1px solid #000; padding-top: 3px; }
            @media print {
              body { width: 63.5mm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${settings?.brandName || 'Escola de gastronomia e negócios'}</h2>
            <p>${dateStr}</p>
          </div>
          
          <div class="section">
            <span class="label">CLIENTE:</span>
            <span class="value">${order.customerName.toUpperCase()}</span>
          </div>
          
          <div class="section">
            <span class="label">TELEFONE:</span>
            <span class="value">${order.phone}</span>
          </div>
          
          ${order.email ? `
          <div class="section">
            <span class="label">EMAIL:</span>
            <span class="value">${order.email}</span>
          </div>
          ` : ''}
          
          <div class="section">
            <span class="label">ENDEREÇO:</span>
            <span class="value">${order.address.toUpperCase()}</span>
          </div>
          
          ${order.birthday ? `
          <div class="section">
            <span class="label">ANIVERSÁRIO:</span>
            <span class="value">${order.birthday}</span>
          </div>
          ` : ''}
          
          <div class="divider"></div>
          
          <div class="section">
            <div class="label" style="margin-bottom: 3px;">ITENS:</div>
            ${itemsHtml}
          </div>
          
          ${order.observation ? `
          <div class="divider"></div>
          <div class="section">
            <div class="label">OBSERVAÇÃO:</div>
            <div class="value" style="font-style: italic;">${order.observation.toUpperCase()}</div>
          </div>
          ` : ''}
          
          <div class="divider"></div>
          <div class="section" style="opacity: 0.8; font-size: 9px;">
            ID: ${order.id}<br/>
            DATA DO PEDIDO: ${dateStr}
          </div>
          
          ${(order.deliveryFee !== undefined && order.deliveryFee > 0) ? `
          <div class="total-section">
            <div>SUBTOTAL: ${currencySymbol} ${(order.subtotal || (order.total - (order.deliveryFee || 0))).toFixed(2).replace('.', ',')}</div>
            <div style="margin-top: 2px;">TAXA DE ENTREGA ${order.deliveryDistanceKm ? `(${order.deliveryDistanceKm} km)` : ''}: + ${currencySymbol} ${order.deliveryFee.toFixed(2).replace('.', ',')}</div>
          </div>
          ` : order.deliveryType === 'pickup' ? `
          <div class="total-section">
            <div>RETIRADA NO ESTABELECIMENTO: GRÁTIS</div>
          </div>
          ` : ''}
          
          ${(order.taxAmount && order.taxAmount > 0) ? `
          <div class="total-section">
            <div>SUBTOTAL: ${currencySymbol} ${(order.subtotal || (order.total - order.taxAmount)).toFixed(2).replace('.', ',')}</div>
            <div style="margin-top: 2px;">TAX (${order.taxRate || 8.25}%): + ${currencySymbol} ${order.taxAmount.toFixed(2).replace('.', ',')}</div>
          </div>
          ` : ''}
          
          <div class="total">
            TOTAL: ${currencySymbol} ${order.total.toFixed(2).replace('.', ',')}
          </div>
        </body>
      </html>
    `);
  };

  const isBirthdayThisWeek = (birthdayStr: string, orderLanguage?: string) => {
    if (!birthdayStr) return false;
    
    const cleaned = birthdayStr.trim().replace(/[\s\.-]+/g, '/');
    const parts = cleaned.split('/');
    if (parts.length < 2) return false;
    
    let p0 = parseInt(parts[0]);
    let p1 = parseInt(parts[1]);
    
    if (isNaN(p0) || isNaN(p1)) return false;
    
    let day = p0;
    let month = p1 - 1; // 0-indexed month
    
    if (p0 <= 12 && p1 > 12) {
      day = p1;
      month = p0 - 1;
    } else {
      day = p0;
      month = p1 - 1;
    }
    
    if (month < 0 || month > 11 || day < 1 || day > 31) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();
    
    const checkDates = [
      new Date(currentYear - 1, month, day),
      new Date(currentYear, month, day),
      new Date(currentYear + 1, month, day)
    ];
    
    return checkDates.some(bday => {
      const diffTime = bday.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= -3 && diffDays <= 7;
    });
  };

  const orderBelongsToCatalog = (order: Order, catalogId: 'catalog1' | 'catalog2' | 'catalog3' | 'catalog4') => {
    if (!order.items || order.items.length === 0) return false;
    return order.items.some(item => {
      const prod = products.find(p => p.title === item.title);
      if (!prod) return false;
      const catObj = categories.find(c => c.id === prod.categoryId);
      if (!catObj) return false;
      const catVal = catObj.catalog || 'catalog1';
      return catVal === catalogId || catVal === 'both' || catVal === 'all';
    });
  };

  const filteredProducts = useMemo(() => {
    const query = productSearch.toLowerCase().trim();
    if (!query) return products;
    return products.filter(product => 
      product.title.toLowerCase().includes(query) || 
      (product.description || '').toLowerCase().includes(query)
    );
  }, [products, productSearch]);

  const filteredOrders = orders.filter(order => {
    const custName = (order.customerName || order.b2bCompanyName || '').toLowerCase();
    const query = orderSearch.toLowerCase().trim();
    const matchesSearch = !query || custName.includes(query) || (order.phone || '').includes(query) || (order.id || '').toLowerCase().includes(query);
    
    const parseDateString = (str: string, _lang?: string) => {
      if (!str || !str.includes('/')) return null;
      const parts = str.split('/');
      if (parts.length !== 3) return null;
      
      let month = parseInt(parts[0]);
      let day = parseInt(parts[1]);
      let year = parseInt(parts[2]);

      // Padrão EUA: MM/DD/YYYY por padrão (somente trata como DD/MM/YYYY se o primeiro número > 12)
      if (month > 12) {
        day = parseInt(parts[0]);
        month = parseInt(parts[1]);
      }
      
      if (!day || !month || !year || month > 12) return null;
      const d = new Date(year, month - 1, day);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    let matchesDate = true;
    if (startDate || endDate) {
      let orderDate: Date | null = null;
      if (order.pickupDate) {
        orderDate = parseDateString(order.pickupDate, order.orderLanguage || settings.language || 'pt');
      }
      
      if (!orderDate) {
        if (order.createdAt?.toDate) {
          orderDate = order.createdAt.toDate();
        } else if (order.createdAt?.seconds) {
          orderDate = new Date(order.createdAt.seconds * 1000);
        } else if (typeof order.createdAt === 'string') {
          const parsed = Date.parse(order.createdAt);
          if (!isNaN(parsed)) orderDate = new Date(parsed);
        }
      }

      if (orderDate) {
        orderDate = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
        if (startDate && startDate.length === 10) {
          const start = parseDateString(startDate, settings.language || 'pt');
          if (start && orderDate < start) matchesDate = false;
        }
        if (endDate && endDate.length === 10) {
          const end = parseDateString(endDate, settings.language || 'pt');
          if (end && orderDate > end) matchesDate = false;
        }
      } else {
        matchesDate = false;
      }
    }

    let matchesValidated = true;
    if (filterValidatedOnly) {
      matchesValidated = order.paymentStatus === 'half' || order.paymentStatus === 'full' || order.paymentStatus === 'paid';
    }
    
    return matchesSearch && matchesDate && matchesValidated;
  }).sort((a, b) => {
    const getMs = (o: Order) => {
      if (o.createdAt?.toDate) return o.createdAt.toDate().getTime();
      if (o.createdAt?.seconds) return o.createdAt.seconds * 1000;
      if (typeof o.createdAt === 'string') {
        const parsed = Date.parse(o.createdAt);
        if (!isNaN(parsed)) return parsed;
      }
      return 0;
    };
    return getMs(b) - getMs(a);
  });

  const batchSummary = useMemo(() => {
    const summary: { [key: string]: number } = {};
    const sidesSummary: { [key: string]: number } = {};

    filteredOrders.forEach(order => {
      order.items?.forEach(item => {
        const key = item.title;
        summary[key] = (summary[key] || 0) + item.quantity;

        if (item.mealOptions?.sides) {
          item.mealOptions.sides.forEach(side => {
            sidesSummary[side.name] = (sidesSummary[side.name] || 0) + item.quantity;
          });
        }
      });
    });

    return { items: summary, sides: sidesSummary };
  }, [filteredOrders]);

  // Financial Preset Helpers
  const setPresetThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setFinanceStartDate(firstDay.toISOString().split('T')[0]);
    setFinanceEndDate(lastDay.toISOString().split('T')[0]);
  };

  const setPresetLastMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    setFinanceStartDate(firstDay.toISOString().split('T')[0]);
    setFinanceEndDate(lastDay.toISOString().split('T')[0]);
  };

  const setPresetLast30Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    setFinanceStartDate(start.toISOString().split('T')[0]);
    setFinanceEndDate(end.toISOString().split('T')[0]);
  };

  const setPresetAllTime = () => {
    setFinanceStartDate('');
    setFinanceEndDate('');
  };

  // Financial Calculations useMemo
  const { filteredFinanceOrders, totalRevenue, appliedFixed, totalVariable, netProfit, daysInPeriod, monthlyFixedSum } = useMemo(() => {
    const start = financeStartDate ? new Date(financeStartDate + 'T00:00:00') : null;
    const end = financeEndDate ? new Date(financeEndDate + 'T23:59:59') : null;

    const parseDateStr = (str: string, lang: string = 'pt') => {
      if (!str) return null;
      if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            d.setHours(0,0,0,0);
            return d;
          }
        }
      }
      if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
          if (lang === 'en') {
            const d = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
            d.setHours(0,0,0,0);
            return d;
          } else {
            const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
            d.setHours(0,0,0,0);
            return d;
          }
        }
      }
      const parsed = Date.parse(str);
      if (!isNaN(parsed)) {
        const d = new Date(parsed);
        d.setHours(0,0,0,0);
        return d;
      }
      return null;
    };

    // 1. Filter Orders
    const filteredOrders = orders.filter(order => {
      let orderDate: Date | null = null;
      if (order.pickupDate) {
        orderDate = parseDateStr(order.pickupDate, order.orderLanguage || settings.language || 'pt');
      }
      if (!orderDate && order.createdAt?.toDate) {
        const dateFromCreated = order.createdAt.toDate();
        if (dateFromCreated) {
          dateFromCreated.setHours(0, 0, 0, 0);
          orderDate = dateFromCreated;
        }
      }
      if (!orderDate) return false;
      if (start && orderDate < start) return false;
      if (end && orderDate > end) return false;
      return true;
    });

    const rev = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // 2. Fixed Costs
    const rent = settings.fixedRent || 0;
    const internet = settings.fixedInternet || 0;
    const electricity = settings.fixedElectricity || 0;
    const water = settings.fixedWater || 0;
    const gas = settings.fixedGas || 0;
    const sistemas = settings.fixedSistemas || 0;
    const marketing = settings.fixedMarketing || 0;
    const contabilidade = settings.fixedContabilidade || 0;
    const salarios = settings.fixedSalarios || 0;
    const mei = settings.fixedMei || 0;
    
    const customSum = settings.customFixedCosts
      ? settings.customFixedCosts.reduce((sum, item) => sum + (item.amount || 0), 0)
      : 0;

    const monthlySum = rent + internet + electricity + water + gas + sistemas + marketing + contabilidade + salarios + mei + customSum;

    // Calculate days difference
    let days = 30;
    if (financeStartDate && financeEndDate) {
      const s = new Date(financeStartDate + 'T00:00:00');
      const e = new Date(financeEndDate + 'T00:00:00');
      const diffTime = Math.abs(e.getTime() - s.getTime());
      days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    let appliedFix = monthlySum;
    if (isProportionalFixed && financeStartDate && financeEndDate) {
      appliedFix = (monthlySum / 30) * days;
    }

    // 3. Variable Costs
    const filteredVarCosts = variableCosts.filter(vc => {
      if (!vc.date) return false;
      const vcDate = new Date(vc.date + 'T12:00:00');
      if (start && vcDate < start) return false;
      if (end && vcDate > end) return false;
      return true;
    });

    const totVar = filteredVarCosts.reduce((sum, vc) => sum + (vc.amount || 0), 0);

    // 4. Net Profit
    const profit = rev - appliedFix - totVar;

    return {
      filteredFinanceOrders: filteredOrders,
      totalRevenue: rev,
      appliedFixed: appliedFix,
      totalVariable: totVar,
      netProfit: profit,
      daysInPeriod: days,
      monthlyFixedSum: monthlySum
    };
  }, [orders, settings, variableCosts, financeStartDate, financeEndDate, isProportionalFixed]);



  const currencySymbol = getCurrencySymbol(settings?.currency);

  if (!isLoggedIn) {
    return (
      <div className="flex-grow flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass p-8 rounded-3xl w-full max-w-md shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="h-24 w-24 flex items-center justify-center mb-4 rounded-full overflow-hidden border-2 border-white shadow-md bg-white">
              <img src={settings?.logo} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <h1 className="text-2xl font-serif font-bold opacity-90">Painel adm - Easy Menu Premium</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="password" 
              placeholder="Senha de acesso"
              className="w-full p-4 rounded-xl border border-gray-300 focus:ring-2 outline-none"
              style={{ '--tw-ring-color': settings?.primaryColor || '#865d39' } as any}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button 
              type="submit"
              className="w-full py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all cursor-pointer"
              style={{ 
                backgroundColor: settings?.primaryColor || '#865d39',
                color: getContrastText(settings?.primaryColor || '#865d39')
              }}
            >
              Entrar
            </button>
            <button 
              type="button"
              onClick={() => {
                setIsLoggedIn(false);
                setIsAdmin(false);
                window.location.hash = '';
                window.history.pushState({}, '', '/');
              }}
              className="w-full py-3 px-4 rounded-xl font-medium text-sm text-gray-700 bg-white/80 hover:bg-white border border-gray-300 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft size={16} /> Voltar para o Cardápio
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col md:flex-row md:h-screen md:overflow-hidden text-gray-900">
      <div className="w-full md:w-64 glass border-r border-white/20 p-4 md:p-6 flex flex-col gap-4 md:gap-8 md:overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 flex items-center justify-center rounded-full overflow-hidden border border-white/50 bg-white shadow-sm">
            <img src={settings?.logo} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <span className="font-serif font-bold text-lg opacity-90">{settings?.brandName || 'Easy Kioski'}</span>
        </div>
        
        <nav className="flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('orders')}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all font-semibold",
              activeTab === 'orders' ? "shadow-lg font-bold" : "hover:bg-white/30 text-black"
            )}
            style={activeTab === 'orders' ? { backgroundColor: settings?.primaryColor || '#865d39', color: getContrastText(settings?.primaryColor || '#865d39') } : {}}
          >
            <History size={20} /> Histórico de Pedidos
          </button>
          <button 
            onClick={() => setActiveTab('customers')}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all font-semibold",
              activeTab === 'customers' ? "shadow-lg font-bold" : "hover:bg-white/30 text-black"
            )}
            style={activeTab === 'customers' ? { backgroundColor: settings?.primaryColor || '#865d39', color: getContrastText(settings?.primaryColor || '#865d39') } : {}}
          >
            <Users size={20} /> Clientes
          </button>
          <button 
            onClick={() => setActiveTab('categories')}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all font-semibold",
              activeTab === 'categories' ? "shadow-lg font-bold" : "hover:bg-white/30 text-black"
            )}
            style={activeTab === 'categories' ? { backgroundColor: settings?.primaryColor || '#865d39', color: getContrastText(settings?.primaryColor || '#865d39') } : {}}
          >
            <Layers size={20} /> Categorias
          </button>
          <button 
            onClick={() => setActiveTab('menu')}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all font-semibold",
              activeTab === 'menu' ? "shadow-lg font-bold" : "hover:bg-white/30 text-black"
            )}
            style={activeTab === 'menu' ? { backgroundColor: settings?.primaryColor || '#865d39', color: getContrastText(settings?.primaryColor || '#865d39') } : {}}
          >
            <Package size={20} /> Gerenciar Cardápio
          </button>

          <button 
            onClick={() => setActiveTab('sortMenu')}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all font-semibold",
              activeTab === 'sortMenu' ? "shadow-lg font-bold" : "hover:bg-white/30 text-black"
            )}
            style={activeTab === 'sortMenu' ? { backgroundColor: settings?.primaryColor || '#865d39', color: getContrastText(settings?.primaryColor || '#865d39') } : {}}
          >
            <ArrowUpDown size={20} /> Organizar Cardápio
          </button>

          <button 
            onClick={() => setActiveTab('pricing')}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all font-semibold",
              activeTab === 'pricing' ? "shadow-lg font-bold" : "hover:bg-white/30 text-black"
            )}
            style={activeTab === 'pricing' ? { backgroundColor: settings?.primaryColor || '#865d39', color: getContrastText(settings?.primaryColor || '#865d39') } : {}}
          >
            <Calculator size={20} /> Precificação
          </button>

          <button 
            onClick={() => setActiveTab('finance')}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all font-semibold",
              activeTab === 'finance' ? "shadow-lg font-bold" : "hover:bg-white/30 text-black"
            )}
            style={activeTab === 'finance' ? { backgroundColor: settings?.primaryColor || '#865d39', color: getContrastText(settings?.primaryColor || '#865d39') } : {}}
          >
            <DollarSign size={20} /> Financeiro
          </button>

          <button 
            onClick={() => setActiveTab('settings')}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all font-semibold",
              activeTab === 'settings' ? "shadow-lg font-bold" : "hover:bg-white/30 text-black"
            )}
            style={activeTab === 'settings' ? { backgroundColor: settings?.primaryColor || '#865d39', color: getContrastText(settings?.primaryColor || '#865d39') } : {}}
          >
            <SettingsIcon size={20} /> Configurações
          </button>

          <button 
            type="button"
            onClick={() => {
              if (onOpenKDS) {
                onOpenKDS();
              } else {
                window.history.pushState({}, '', '/kds');
                window.location.reload();
              }
            }}
            className="mt-2 flex items-center gap-3 p-3 rounded-xl transition-all font-bold bg-stone-900 text-white hover:bg-stone-800 shadow-md cursor-pointer"
          >
            <ChefHat size={20} /> Tela da Cozinha (KDS)
          </button>
        </nav>

        <button 
          onClick={() => {
            setIsLoggedIn(false);
            setIsAdmin(false);
            window.location.hash = '';
            window.history.pushState({}, '', '/');
          }}
          className="mt-auto flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 text-red-600 transition-all font-bold cursor-pointer"
        >
          <LogOut size={20} /> Sair
        </button>
      </div>

      <main id="admin-main-content" className="flex-grow p-4 md:p-10 overflow-y-auto min-w-0 w-full">
        {activeTab === 'finance' && (
          <div className="max-w-6xl space-y-8 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/50 pb-6">
              <div>
                <h1 className="text-3xl font-serif font-black" style={{ color: settings.primaryColor || '#865d39' }}>Painel Financeiro</h1>
                <p className="text-sm text-black font-semibold opacity-70">
                  Monitore receitas, custos fixos, custos variáveis e o lucro líquido do seu negócio.
                </p>
              </div>

              {/* Date Filters */}
              <div className="flex flex-col gap-2 bg-white p-4 rounded-2xl border border-gray-200/60 shadow-sm animate-fade-in">
                <div className="text-[10px] font-bold uppercase text-gray-500 mb-1">Filtrar por Período</div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-xl px-3 py-1.5 shadow-inner">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">De:</span>
                    <input 
                      type="date" 
                      className="border-0 bg-transparent text-xs font-bold text-gray-800 outline-none"
                      value={financeStartDate}
                      onChange={e => setFinanceStartDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-xl px-3 py-1.5 shadow-inner">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Até:</span>
                    <input 
                      type="date" 
                      className="border-0 bg-transparent text-xs font-bold text-gray-800 outline-none"
                      value={financeEndDate}
                      onChange={e => setFinanceEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <button onClick={setPresetThisMonth} className="px-2 py-1 text-[10px] font-bold uppercase bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-all cursor-pointer">Este Mês</button>
                  <button onClick={setPresetLastMonth} className="px-2 py-1 text-[10px] font-bold uppercase bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-all cursor-pointer">Mês Passado</button>
                  <button onClick={setPresetLast30Days} className="px-2 py-1 text-[10px] font-bold uppercase bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-all cursor-pointer">Últimos 30 dias</button>
                  <button onClick={setPresetAllTime} className="px-2 py-1 text-[10px] font-bold uppercase bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-all cursor-pointer">Ver Tudo</button>
                </div>
              </div>
            </div>

            {/* Metrics Dashboard Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
              {/* Revenue Card (Clicável para ver todos os pedidos do período) */}
              <button
                type="button"
                onClick={() => setShowFinancePeriodOrdersModal(true)}
                className="bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 hover:border-emerald-400 rounded-2xl p-5 shadow-sm hover:shadow-md relative overflow-hidden flex flex-col justify-between h-32 text-left transition-all cursor-pointer group"
                title="Clique para visualizar os pedidos deste período"
              >
                <div className="absolute right-3 top-3 bg-emerald-500/10 text-emerald-700 p-2 rounded-xl group-hover:scale-105 transition-transform">
                  <DollarSign size={22} />
                </div>
                <div className="text-xs font-bold uppercase text-emerald-800/80 tracking-wider">Receita (Faturamento)</div>
                <div className="text-2xl font-black text-emerald-950 mt-1">
                  {currencySymbol} {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] font-bold text-emerald-700 mt-1 uppercase flex items-center justify-between gap-1 w-full">
                  <span>{filteredFinanceOrders.length} {filteredFinanceOrders.length === 1 ? 'Pedido no período' : 'Pedidos no período'}</span>
                  <span className="underline opacity-80 group-hover:opacity-100">Ver lista →</span>
                </div>
              </button>

              {/* Fixed Costs Card */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between h-32">
                <div className="absolute right-3 top-3 bg-amber-500/10 text-amber-700 p-2 rounded-xl">
                  <Save size={22} />
                </div>
                <div className="text-xs font-bold uppercase text-amber-800/80 tracking-wider">Custos Fixos Aplicados</div>
                <div className="text-2xl font-black text-amber-950 mt-1">
                  {currencySymbol} {appliedFixed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] font-bold text-amber-700/80 mt-1 uppercase flex items-center gap-1">
                  <span>Soma mensal: {currencySymbol} {monthlyFixedSum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Variable Costs Card */}
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between h-32">
                <div className="absolute right-3 top-3 bg-rose-500/10 text-rose-700 p-2 rounded-xl">
                  <Trash2 size={22} />
                </div>
                <div className="text-xs font-bold uppercase text-rose-800/80 tracking-wider">Custos Variáveis</div>
                <div className="text-2xl font-black text-rose-950 mt-1">
                  {currencySymbol} {totalVariable.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] font-bold text-rose-700/80 mt-1 uppercase">
                  No período selecionado
                </div>
              </div>

              {/* Net Profit Card */}
              <div className={cn(
                "rounded-2xl p-5 shadow-md relative overflow-hidden flex flex-col justify-between h-32 border transition-all",
                netProfit >= 0 
                  ? "bg-emerald-600 border-emerald-700 text-white" 
                  : "bg-rose-600 border-rose-700 text-white"
              )}>
                <div className="absolute right-3 top-3 bg-white/20 p-2 rounded-xl">
                  <Coins size={22} />
                </div>
                <div className="text-xs font-bold uppercase tracking-wider opacity-85">LUCRO LÍQUIDO</div>
                <div className="text-2xl font-black mt-1">
                  {currencySymbol} {netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] font-bold uppercase opacity-85">
                  {netProfit >= 0 ? 'Resultado Positivo' : 'Prejuízo no período'}
                </div>
              </div>
            </div>

            {/* Split Input Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Column 1: Configuração Custos Fixos */}
              <div className="p-6 rounded-2xl space-y-4 shadow-sm border border-gray-200/50 bg-white">
                <div className="border-b border-gray-200/50 pb-2 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold font-serif text-gray-800">Custos Fixos Mensais</h2>
                    <p className="text-xs text-gray-500">Deixe em branco ou zero os que não possuir (o código irá ignorá-los).</p>
                  </div>
                </div>

                <form onSubmit={handleSaveFixedCosts} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Aluguel ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 1500,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedRentInput}
                        onChange={e => setFixedRentInput(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Internet ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 100,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedInternetInput}
                        onChange={e => setFixedInternetInput(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Luz ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 250,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedElectricityInput}
                        onChange={e => setFixedElectricityInput(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Água ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 80,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedWaterInput}
                        onChange={e => setFixedWaterInput(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Gás ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 120,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedGasInput}
                        onChange={e => setFixedGasInput(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Plataformas / Sistemas ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 150,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedSistemasInput}
                        onChange={e => setFixedSistemasInput(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Marketing / Tráfego ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 300,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedMarketingInput}
                        onChange={e => setFixedMarketingInput(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Contabilidade ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 400,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedContabilidadeInput}
                        onChange={e => setFixedContabilidadeInput(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">Salários / Pró-labore ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 3000,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedSalariosInput}
                        onChange={e => setFixedSalariosInput(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-gray-500">MEI / Impostos ({currencySymbol})</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 80,00"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={fixedMeiInput}
                        onChange={e => setFixedMeiInput(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Custos Fixos Personalizados */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                      <label className="text-[10px] font-extrabold uppercase text-gray-500 tracking-wider">Custos Fixos Adicionais / Personalizados</label>
                      <button
                        type="button"
                        onClick={() => setCustomFixedCosts([...customFixedCosts, { label: '', amount: '' }])}
                        className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                      >
                        <Plus size={14} /> Adicionar Custo
                      </button>
                    </div>

                    {customFixedCosts.length > 0 ? (
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {customFixedCosts.map((item, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <input
                              type="text"
                              placeholder="Nome do custo (ex: Aluguel de Máquina, Taxas...)"
                              className="flex-grow p-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 outline-none focus:ring-1 focus:ring-emerald-500"
                              value={item.label}
                              onChange={e => {
                                const newCosts = [...customFixedCosts];
                                newCosts[index].label = e.target.value;
                                setCustomFixedCosts(newCosts);
                              }}
                            />
                            <div className="relative w-28 flex-shrink-0">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">{currencySymbol}</span>
                              <input
                                type="text"
                                placeholder="0,00"
                                className="w-full p-2 pl-6 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 outline-none focus:ring-1 focus:ring-emerald-500"
                                value={item.amount}
                                onChange={e => {
                                  const newCosts = [...customFixedCosts];
                                  newCosts[index].amount = e.target.value;
                                  setCustomFixedCosts(newCosts);
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setCustomFixedCosts(customFixedCosts.filter((_, idx) => idx !== index))}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-400 italic">Nenhum custo fixo adicional adicionado ainda.</p>
                    )}
                  </div>

                  {/* Calculations Mode */}
                  <div className="bg-gray-100/50 p-3.5 rounded-xl border border-gray-200/80 space-y-2">
                    <div className="text-[10px] font-extrabold uppercase text-gray-600">Aplicação no Período Selecionado</div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        checked={isProportionalFixed}
                        onChange={e => setIsProportionalFixed(e.target.checked)}
                      />
                      <span className="text-xs text-gray-700 font-bold">
                        Calcular proporcionalmente aos dias do período ({daysInPeriod} dias de 30)
                      </span>
                    </label>
                    <div className="text-[10px] text-gray-500 italic mt-1 leading-normal">
                      Se desmarcado, o custo fixo integral configurado será subtraído do lucro final, independentemente de quantos dias foram selecionados no filtro.
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-3 rounded-xl font-bold shadow-md hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-center gap-2 text-white"
                    style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                  >
                    <Save size={18} /> Salvar Custos Fixos
                  </button>
                </form>
              </div>

              {/* Column 2: Custos Variáveis */}
              <div className="p-6 rounded-2xl space-y-4 shadow-sm border border-gray-200/50 bg-white flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="border-b border-gray-200/50 pb-2">
                    <h2 className="text-lg font-bold font-serif text-gray-800">
                      {isEditingVarCost ? 'Editar Custo Variável' : 'Lançar Custo Variável (Mercado, etc)'}
                    </h2>
                    <p className="text-xs text-gray-500">Adicione compras pontuais de ingredientes, embalagens e mercado.</p>
                  </div>

                  <form onSubmit={handleAddVarCost} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-bold uppercase text-gray-500">Descrição do Custo</label>
                        <input 
                          type="text" 
                          placeholder="Ex: Compra de carne e temperos no atacadão"
                          className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                          value={newVarCost.description || ''}
                          onChange={e => setNewVarCost({...newVarCost, description: e.target.value})}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-gray-500">Valor ({currencySymbol})</label>
                        <input 
                          type="text" 
                          placeholder="0,00"
                          className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                          value={varCostAmountInput}
                          onChange={e => setVarCostAmountInput(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-gray-500">Data do Gasto</label>
                        <input 
                          type="date" 
                          className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                          value={newVarCost.date || ''}
                          onChange={e => setNewVarCost({...newVarCost, date: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        type="submit"
                        className="flex-grow py-3 rounded-xl font-bold shadow-md hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-center gap-2 bg-gray-800 text-white"
                      >
                        {isEditingVarCost ? <Save size={18} /> : <Plus size={18} />}
                        {isEditingVarCost ? 'Salvar Edição' : 'Lançar Gasto'}
                      </button>
                      {isEditingVarCost && (
                        <button 
                          type="button"
                          onClick={() => {
                            setIsEditingVarCost(null);
                            setNewVarCost({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
                            setVarCostAmountInput('');
                          }}
                          className="px-4 py-3 rounded-xl font-bold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all cursor-pointer text-xs"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {/* Sub-section: List of Variable Costs */}
                <div className="space-y-2 mt-6 pt-6 border-t border-gray-200/50">
                  <div className="text-[10px] font-extrabold uppercase text-gray-500 mb-2">
                    Gastos Variáveis Registrados no Período
                  </div>
                  
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {variableCosts
                      .filter(vc => {
                        if (!vc.date) return false;
                        const vcDate = new Date(vc.date + 'T12:00:00');
                        const start = financeStartDate ? new Date(financeStartDate + 'T00:00:00') : null;
                        const end = financeEndDate ? new Date(financeEndDate + 'T23:59:59') : null;
                        if (start && vcDate < start) return false;
                        if (end && vcDate > end) return false;
                        return true;
                      })
                      .sort((a,b) => b.date.localeCompare(a.date))
                      .map(vc => (
                        <div key={vc.id} className="bg-white/75 border border-gray-200 p-3 rounded-xl flex items-center justify-between group">
                          <div>
                            <div className="font-bold text-xs text-gray-800">{vc.description}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5 font-semibold flex items-center gap-2">
                              <span>{new Date(vc.date + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</span>
                              <span>•</span>
                              <span className="text-rose-600 font-bold">{currencySymbol} {vc.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setIsEditingVarCost(vc);
                                setNewVarCost(vc);
                                setVarCostAmountInput(vc.amount.toString());
                                scrollToTop();
                              }}
                              className="p-1.5 text-amber-900 hover:bg-amber-50 rounded-lg cursor-pointer transition-all"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDeleteVarCost(vc.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-all"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    
                    {variableCosts.filter(vc => {
                      if (!vc.date) return false;
                      const vcDate = new Date(vc.date + 'T12:00:00');
                      const start = financeStartDate ? new Date(financeStartDate + 'T00:00:00') : null;
                      const end = financeEndDate ? new Date(financeEndDate + 'T23:59:59') : null;
                      if (start && vcDate < start) return false;
                      if (end && vcDate > end) return false;
                      return true;
                    }).length === 0 && (
                      <div className="text-center py-6 text-xs text-gray-400 font-medium italic">
                        Nenhum custo variável lançado neste período.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'galleries' && (
          <div className="max-w-5xl space-y-8 pb-10">
            <div className="flex items-center justify-between border-b border-gray-200/50 pb-4">
              <div>
                <h1 className="text-3xl font-serif font-black" style={{ color: settings.primaryColor || '#865d39' }}>Galerias de Imagem</h1>
                <p className="text-sm text-black font-semibold opacity-100" style={{ color: '#000000' }}>Crie e gerencie até 6 galerias com 6 fotos cada para exibir como referências de estilo para bolos personalizados.</p>
              </div>
              <div>
                <button
                  type="button"
                  disabled={galleries.length >= 6}
                  onClick={async () => {
                    if (galleries.length >= 6) {
                      toast.error("O limite é de no máximo 6 galerias!");
                      return;
                    }
                    try {
                      await addDoc(collection(db, "galerias"), {
                        name: `Galeria ${galleries.length + 1}`,
                        images: ["", "", "", "", "", ""]
                      });
                      toast.success("Galeria criada com sucesso!");
                    } catch (e) {
                      toast.error("Erro ao criar galeria.");
                    }
                  }}
                className={cn(
                    "flex items-center gap-1.5 py-4 px-6 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow border-0",
                    galleries.length >= 6 ? "bg-gray-400 text-white cursor-not-allowed" : "hover:scale-[1.02] cursor-pointer"
                  )}
                  style={galleries.length >= 6 ? {} : { 
                    backgroundColor: settings.primaryColor || '#865d39',
                    color: getContrastText(settings.primaryColor || '#865d39')
                  }}
                >
                  <Plus size={16} /> Criar Nova Galeria ({galleries.length}/6)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {galleries.map((gallery) => (
                <div key={gallery.id} className="glass p-6 rounded-3xl space-y-4 relative flex flex-col justify-between">
                  <div>
                    {/* Gallery Title Input and Delete Button */}
                    <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-3 mb-2">
                      <input
                        type="text"
                        value={gallery.name}
                        onChange={async (e) => {
                          const val = e.target.value;
                          await updateDoc(doc(db, "galerias", gallery.id), {
                            name: val
                          });
                        }}
                        className="font-serif font-black text-lg bg-transparent border-b border-transparent hover:border-black/20 focus:border-black/50 focus:outline-none transition-all w-3/4 pb-0.5 text-black"
                        placeholder="Nome da Galeria"
                      />
                      {galleryIdToDelete === gallery.id ? (
                        <div className="flex items-center gap-1.5 animate-fade-in">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await deleteDoc(doc(db, "galerias", gallery.id));
                                toast.success("Galeria removida com sucesso!");
                                setGalleryIdToDelete(null);
                              } catch (e) {
                                toast.error("Erro ao remover galeria.");
                              }
                            }}
                            className="px-2 py-1 text-xs text-white rounded-lg font-bold transition-all border-0 cursor-pointer shadow-sm"
                            style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
                          >
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setGalleryIdToDelete(null);
                            }}
                            className="px-2 py-1 text-xs text-black bg-gray-200 hover:bg-gray-300 rounded-lg font-bold transition-all border-0 cursor-pointer"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setGalleryIdToDelete(gallery.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors font-medium border-0 cursor-pointer"
                          title="Excluir Galeria"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {/* Image uploads grid - 6 separate slots */}
                    <div className="bg-white/60 border border-white/30 rounded-2xl p-3 mt-2 shadow-sm">
                      <p className="text-[11px] font-bold text-gray-950 leading-relaxed text-center">
                        Gerencie as 6 imagens da galeria de forma independente abaixo. Clique em um espaço para fazer upload ou apague para remover.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3.5 mt-3">
                      {[0, 1, 2, 3, 4, 5].map((index) => {
                        const currentImg = gallery.images?.[index] || "";
                        return (
                          <div key={index} className="flex flex-col items-center gap-1.5">
                            <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-white/40 border border-black/10 flex items-center justify-center group shadow-sm">
                              {currentImg ? (
                                <>
                                  <img
                                    src={currentImg}
                                    alt={`Slot ${index + 1}`}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity gap-1.5 p-1">
                                    {/* Edit Upload */}
                                    <label className="p-1.5 bg-white text-gray-800 rounded-full cursor-pointer hover:scale-105 shadow hover:text-black">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          handleFileChange(e, async (b64) => {
                                            const updatedImages = [...(gallery.images || ["", "", "", "", "", ""])];
                                            updatedImages[index] = b64;
                                            await updateDoc(doc(db, "galerias", gallery.id), {
                                              images: updatedImages
                                            });
                                            toast.success(`Foto ${index + 1} alterada com sucesso!`);
                                          }, true);
                                        }}
                                      />
                                      <Edit2 size={12} />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const updatedImages = [...(gallery.images || ["", "", "", "", "", ""])];
                                        updatedImages[index] = "";
                                        await updateDoc(doc(db, "galerias", gallery.id), {
                                          images: updatedImages
                                        });
                                        toast.success(`Foto ${index + 1} removida!`);
                                      }}
                                      className="p-1.5 bg-red-500 text-white rounded-full hover:scale-105 shadow border-0 cursor-pointer"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-white/50 transition-colors p-2 text-center text-gray-500 hover:text-black select-none">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      handleFileChange(e, async (b64) => {
                                        const updatedImages = [...(gallery.images || ["", "", "", "", "", ""])];
                                        updatedImages[index] = b64;
                                        await updateDoc(doc(db, "galerias", gallery.id), {
                                          images: updatedImages
                                        });
                                        toast.success(`Foto ${index + 1} adicionada com sucesso!`);
                                      }, true);
                                    }}
                                  />
                                  <Plus size={16} className="text-gray-400" />
                                  <span className="text-[9px] font-black uppercase tracking-wider mt-1 opacity-60">Enviar</span>
                                </label>
                              )}
                            </div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-black/60">Foto {index + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {galleries.length === 0 && (
                <div className="md:col-span-2 glass p-10 rounded-3xl text-center space-y-3">
                  <div className="w-12 h-12 bg-black/5 rounded-full flex items-center justify-center mx-auto text-gray-400">
                    <ImageIcon size={24} />
                  </div>
                  <div>
                    <h3 className="font-serif font-black text-lg text-black">Nenhuma galeria criada</h3>
                    <p className="text-xs font-semibold text-gray-500 max-w-sm mx-auto leading-normal">Comece criando uma nova galeria de fotos separadas acima e vincule-a nos seus bolos personalizados!</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'cakeOptions' && (
          <div className="max-w-4xl space-y-8 pb-10">
            <div className="flex items-center justify-between border-b border-gray-200/50 pb-4">
              <div>
                <h1 className="text-3xl font-serif font-black" style={{ color: settings.primaryColor || '#865d39' }}>Opções de Bolos</h1>
                <p className="text-sm text-black font-semibold opacity-100" style={{ color: '#000000' }}>Gerencie tamanhos, massas, recheios, coberturas e toppers que poderão ser customizados pelo cliente.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* TAMANHOS */}
              <div className="glass p-6 rounded-3xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-black/10">
                  <h3 className="text-sm font-serif font-extrabold uppercase tracking-widest text-[#000000]" style={{ color: '#000000' }}>Tamanhos / Fatias / Peso</h3>
                  <button 
                    onClick={() => addCakeOptionItem('cakeSizes', '')}
                    className="p-1.5 rounded-full text-white active:scale-95 transition-transform cursor-pointer shadow-xs hover:brightness-110"
                    style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                    title="Adicionar tamanho"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="space-y-2 max-h-62 overflow-y-auto pr-1">
                  {(settings.cakeSizes || []).length === 0 ? (
                    <p className="text-xs text-black font-semibold italic py-2" style={{ color: '#000000' }}>Nenhum tamanho adicionado.</p>
                  ) : (
                    (settings.cakeSizes || []).map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input 
                          type="text"
                          value={item}
                          placeholder="Ex: 7 inches - 20 fatias - 1,5 kg"
                          onChange={(e) => updateCakeOptionItem('cakeSizes', idx, e.target.value)}
                          className="flex-grow bg-white/60 border border-gray-200 py-2.5 px-4 rounded-xl text-sm"
                        />
                        <button 
                          onClick={() => removeCakeOptionItem('cakeSizes', idx)}
                          className="p-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 active:scale-95 transition-transform"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* MASSAS */}
              <div className="glass p-6 rounded-3xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-black/10">
                  <h3 className="text-sm font-serif font-extrabold uppercase tracking-widest text-[#000000]" style={{ color: '#000000' }}>Tipos de Massa</h3>
                  <button 
                    onClick={() => addCakeOptionItem('cakeDoughs', '')}
                    className="p-1.5 rounded-full text-white active:scale-95 transition-transform cursor-pointer shadow-xs hover:brightness-110"
                    style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                    title="Adicionar massa"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="space-y-2 max-h-62 overflow-y-auto pr-1">
                  {(settings.cakeDoughs || []).length === 0 ? (
                    <p className="text-xs text-black font-semibold italic py-2" style={{ color: '#000000' }}>Nenhuma massa adicionada.</p>
                  ) : (
                    (settings.cakeDoughs || []).map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input 
                          type="text"
                          value={item}
                          placeholder="Ex: Chocolate, Branca, Mesclado"
                          onChange={(e) => updateCakeOptionItem('cakeDoughs', idx, e.target.value)}
                          className="flex-grow bg-white/60 border border-gray-200 py-2.5 px-4 rounded-xl text-sm"
                        />
                        <button 
                          onClick={() => removeCakeOptionItem('cakeDoughs', idx)}
                          className="p-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 active:scale-95 transition-transform"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* RECHEIOS */}
              <div className="glass p-6 rounded-3xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-black/10">
                  <div className="space-y-1">
                    <h3 className="text-sm font-serif font-extrabold uppercase tracking-widest text-[#000000]" style={{ color: '#000000' }}>Recheios</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-black font-extrabold" style={{ color: '#000000' }}>Máximo de opções:</span>
                      <input 
                        type="number"
                        min="1"
                        max="10"
                        value={settings.cakeFillingsMax || 2}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setSettings(prev => ({ ...prev, cakeFillingsMax: val }));
                        }}
                        className="w-16 bg-white/60 border border-gray-200 py-1 px-2 rounded-lg text-sm text-center font-bold"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => addCakeOptionItem('cakeFillings', '')}
                    className="p-1.5 rounded-full text-white active:scale-95 transition-transform cursor-pointer shadow-xs hover:brightness-110"
                    style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                    title="Adicionar recheio"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="space-y-2 max-h-62 overflow-y-auto pr-1">
                  {(settings.cakeFillings || []).length === 0 ? (
                    <p className="text-xs text-black font-semibold italic py-2" style={{ color: '#000000' }}>Nenhum recheio adicionado.</p>
                  ) : (
                    (settings.cakeFillings || []).map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input 
                          type="text"
                          value={item}
                          placeholder="Ex: Chocolate, Morango, Cereja, Abacaxi"
                          onChange={(e) => updateCakeOptionItem('cakeFillings', idx, e.target.value)}
                          className="flex-grow bg-white/60 border border-gray-200 py-2.5 px-4 rounded-xl text-sm"
                        />
                        <button 
                          onClick={() => removeCakeOptionItem('cakeFillings', idx)}
                          className="p-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 active:scale-95 transition-transform"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* COBERTURAS */}
              <div className="glass p-6 rounded-3xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-black/10">
                  <h3 className="text-sm font-serif font-extrabold uppercase tracking-widest text-[#000000]" style={{ color: '#000000' }}>Coberturas</h3>
                  <button 
                    onClick={() => addCakeOptionItem('cakeToppings', '')}
                    className="p-1.5 rounded-full text-white active:scale-95 transition-transform cursor-pointer shadow-xs hover:brightness-110"
                    style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                    title="Adicionar cobertura"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="space-y-2 max-h-62 overflow-y-auto pr-1">
                  {(settings.cakeToppings || []).length === 0 ? (
                    <p className="text-xs text-black font-semibold italic py-2" style={{ color: '#000000' }}>Nenhuma cobertura adicionada.</p>
                  ) : (
                    (settings.cakeToppings || []).map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input 
                          type="text"
                          value={item}
                          placeholder="Ex: Chocolate, Chantilly"
                          onChange={(e) => updateCakeOptionItem('cakeToppings', idx, e.target.value)}
                          className="flex-grow bg-white/60 border border-gray-200 py-2.5 px-4 rounded-xl text-sm"
                        />
                        <button 
                          onClick={() => removeCakeOptionItem('cakeToppings', idx)}
                          className="p-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 active:scale-95 transition-transform"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* TOPO DO BOLO */}
              <div className="glass p-6 rounded-3xl space-y-4 md:col-span-2">
                <div className="flex justify-between items-center pb-2 border-b border-black/10">
                  <h3 className="text-sm font-serif font-extrabold uppercase tracking-widest text-[#000000]" style={{ color: '#000000' }}>Topo do Bolo (Topper)</h3>
                  <button 
                    onClick={() => addCakeOptionItem('cakeToppers', '')}
                    className="p-1.5 rounded-full text-white active:scale-95 transition-transform cursor-pointer shadow-xs hover:brightness-110"
                    style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                    title="Adicionar topo de bolo"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="space-y-2 max-h-62 overflow-y-auto pr-1">
                  {(settings.cakeToppers || []).length === 0 ? (
                    <p className="text-xs text-black font-semibold italic py-2" style={{ color: '#000000' }}>Nenhum topo de bolo adicionado.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(settings.cakeToppers || []).map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <input 
                            type="text"
                            value={item}
                            placeholder="Ex: Flores, Topper"
                            onChange={(e) => updateCakeOptionItem('cakeToppers', idx, e.target.value)}
                            className="flex-grow bg-white/60 border border-gray-200 py-2.5 px-4 rounded-xl text-sm"
                          />
                          <button 
                            onClick={() => removeCakeOptionItem('cakeToppers', idx)}
                            className="p-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 active:scale-95 transition-transform"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className="flex items-center gap-2 px-8 py-4 font-extrabold rounded-2xl shadow-xl transition-all active:scale-[0.98] select-none hover:shadow-2xl cursor-pointer disabled:opacity-50"
                style={{ 
                  backgroundColor: settings.primaryColor || '#865d39',
                  color: getContrastText(settings.primaryColor || '#865d39')
                }}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    <span>Salvar Opções de Bolos</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl space-y-8 pb-10">
            <h2 className="text-3xl font-serif font-bold">Configure seu app</h2>
            
            <div className="glass p-6 rounded-2xl space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. FAÇA O UPLOAD DO SEU LOGO */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-700 tracking-wider">
                    FAÇA O UPLOAD DO SEU LOGO
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-white p-1 border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                      <img src={settings?.logo} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input 
                        type="file" 
                        id="logo-upload"
                        accept="image/*"
                        onChange={e => handleFileChange(e, (b64) => setSettings({...settings, logo: b64}), 'logo')}
                        className="hidden"
                      />
                      <label 
                        htmlFor="logo-upload"
                        className="px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-50 transition-colors text-black shadow-xs flex items-center justify-center whitespace-nowrap"
                      >
                        Selecionar Imagem
                      </label>
                      <button
                        type="button"
                        onClick={() => setSettings({...settings, logo: 'https://i.ibb.co/SXRBhD32/dende.png'})}
                        className="px-3.5 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Remover Logo
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. COR PRIMÁRIA */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-700 tracking-wider">
                    COR PRIMÁRIA
                  </label>
                  <div className="flex items-center gap-3">
                    <label 
                      className="w-12 h-11 rounded-xl border border-gray-300 shadow-xs flex-shrink-0 cursor-pointer overflow-hidden block relative"
                      style={{ backgroundColor: settings?.primaryColor || '#424733' }}
                    >
                      <input 
                        type="color" 
                        value={settings?.primaryColor?.startsWith('#') ? settings?.primaryColor : '#424733'}
                        onChange={e => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                    </label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-200/80 bg-gray-100/70 font-mono text-sm text-gray-900 focus:outline-none focus:bg-white transition-colors"
                      value={settings?.primaryColor || '#424733'}
                      onChange={e => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                    />
                  </div>
                </div>

                {/* 3. COR DO EFEITO GLASS */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-700 tracking-wider">
                    COR DO EFEITO GLASS
                  </label>
                  <div className="flex items-center gap-3">
                    <label 
                      className="w-12 h-11 rounded-xl border border-gray-300 shadow-xs flex-shrink-0 cursor-pointer overflow-hidden block relative"
                      style={{ backgroundColor: settings?.glassColor || 'rgba(255, 255, 255, 0.4)' }}
                    >
                      <input 
                        type="color" 
                        value={settings?.glassColor?.startsWith('#') ? settings?.glassColor : '#ffffff'}
                        onChange={e => setSettings(prev => ({ ...prev, glassColor: e.target.value }))}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                    </label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-200/80 bg-gray-100/70 font-mono text-sm text-gray-900 focus:outline-none focus:bg-white transition-colors"
                      value={settings?.glassColor || 'rgba(255, 255, 255, 0.4)'}
                      onChange={e => setSettings(prev => ({ ...prev, glassColor: e.target.value }))}
                    />
                  </div>
                </div>

                {/* 4. COR DA FONTE (TEXTOS) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-700 tracking-wider">
                    COR DA FONTE (TEXTOS)
                  </label>
                  <div className="flex items-center gap-3">
                    <label 
                      className="w-12 h-11 rounded-xl border border-gray-300 shadow-xs flex-shrink-0 cursor-pointer overflow-hidden block relative"
                      style={{ backgroundColor: settings?.textColor || '#000000' }}
                    >
                      <input 
                        type="color" 
                        value={settings?.textColor?.startsWith('#') ? settings?.textColor : '#000000'}
                        onChange={e => setSettings(prev => ({ ...prev, textColor: e.target.value }))}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                    </label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-200/80 bg-gray-100/70 font-mono text-sm text-gray-900 focus:outline-none focus:bg-white transition-colors"
                      value={settings?.textColor || '#000000'}
                      onChange={e => setSettings(prev => ({ ...prev, textColor: e.target.value }))}
                    />
                  </div>
                </div>

                {/* 5. COR DA FONTE (CATEGORIAS) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-700 tracking-wider">
                    COR DA FONTE (CATEGORIAS)
                  </label>
                  <div className="flex items-center gap-3">
                    <label 
                      className="w-12 h-11 rounded-xl border border-gray-300 shadow-xs flex-shrink-0 cursor-pointer overflow-hidden block relative"
                      style={{ backgroundColor: settings?.categoryTextColor || '#424733' }}
                    >
                      <input 
                        type="color" 
                        value={settings?.categoryTextColor?.startsWith('#') ? settings?.categoryTextColor : '#424733'}
                        onChange={e => setSettings(prev => ({ ...prev, categoryTextColor: e.target.value }))}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                    </label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-200/80 bg-gray-100/70 font-mono text-sm text-gray-900 focus:outline-none focus:bg-white transition-colors"
                      value={settings?.categoryTextColor || '#424733'}
                      onChange={e => setSettings(prev => ({ ...prev, categoryTextColor: e.target.value }))}
                    />
                  </div>
                </div>

                {/* 6. COR DA MARCA (NOME DA MARCA) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-700 tracking-wider">
                    COR DA MARCA (NOME DA MARCA)
                  </label>
                  <div className="flex items-center gap-3">
                    <label 
                      className="w-12 h-11 rounded-xl border border-gray-300 shadow-xs flex-shrink-0 cursor-pointer overflow-hidden block relative"
                      style={{ backgroundColor: settings?.brandTextColor || '#424733' }}
                    >
                      <input 
                        type="color" 
                        value={settings?.brandTextColor?.startsWith('#') ? settings?.brandTextColor : '#424733'}
                        onChange={e => setSettings(prev => ({ ...prev, brandTextColor: e.target.value }))}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                    </label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-200/80 bg-gray-100/70 font-mono text-sm text-gray-900 focus:outline-none focus:bg-white transition-colors"
                      value={settings?.brandTextColor || '#424733'}
                      onChange={e => setSettings(prev => ({ ...prev, brandTextColor: e.target.value }))}
                    />
                  </div>
                </div>

                {/* 7. COR DE "VER DETALHES" E PREÇO */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-700 tracking-wider">
                    COR DE "VER DETALHES" E PREÇO
                  </label>
                  <div className="flex items-center gap-3">
                    <label 
                      className="w-12 h-11 rounded-xl border border-gray-300 shadow-xs flex-shrink-0 cursor-pointer overflow-hidden block relative"
                      style={{ backgroundColor: settings?.priceColor || '#865d39' }}
                    >
                      <input 
                        type="color" 
                        value={settings?.priceColor?.startsWith('#') ? settings?.priceColor : '#865d39'}
                        onChange={e => setSettings(prev => ({ ...prev, priceColor: e.target.value, detailsColor: e.target.value }))}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                    </label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-200/80 bg-gray-100/70 font-mono text-sm text-gray-900 focus:outline-none focus:bg-white transition-colors"
                      value={settings?.priceColor || '#865d39'}
                      onChange={e => setSettings(prev => ({ ...prev, priceColor: e.target.value, detailsColor: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Spacer para grid */}
                <div className="hidden md:block"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase opacity-60">Slogan do App</label>
                  <textarea 
                    rows={2}
                    className="w-full p-3 rounded-xl border border-gray-300"
                    value={settings?.slogan || ''}
                    onChange={e => setSettings({...settings, slogan: e.target.value})}
                    placeholder="Ex: O sabor que você merece..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase opacity-60">Mensagem Final WhatsApp</label>
                  <textarea 
                    rows={2}
                    className="w-full p-3 rounded-xl border border-gray-300"
                    value={settings?.whatsappClosingMessage || ''}
                    onChange={e => setSettings({...settings, whatsappClosingMessage: e.target.value})}
                    placeholder="Ex: Obrigada pelo pedido..."
                  />
                </div>
              </div>



              <div className="space-y-2">
                <label className="text-sm font-bold uppercase opacity-60">Imagem de Fundo do App</label>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-32 h-20 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm">
                      {settings?.backgroundImage ? (
                        <img 
                          key={settings.backgroundImage}
                          src={settings.backgroundImage} 
                          alt="Background Preview" 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Sem fundo</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <input 
                        type="file" 
                        id="bg-upload"
                        accept="image/*"
                        onChange={e => handleFileChange(e, (b64) => setSettings(prev => ({...prev, backgroundImage: b64})), 'background')}
                        className="hidden"
                      />
                      <label 
                        htmlFor="bg-upload"
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold cursor-pointer hover:bg-gray-50 transition-colors text-black"
                      >
                        Fazer Upload
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase opacity-40">Ou cole o link da imagem direta</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 text-sm"
                      value={settings?.backgroundImage?.startsWith('data:image/') ? '' : (settings?.backgroundImage || '')}
                      onChange={e => setSettings(prev => ({...prev, backgroundImage: e.target.value}))}
                      placeholder="https://exemplo.com/imagem.jpg"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase opacity-60">Nome da Marca</label>
                  <input 
                    type="text" 
                    className="w-full p-3 rounded-xl border border-gray-300"
                    value={settings?.brandName || ''}
                    onChange={e => handleBrandNameChange(e.target.value)}
                    placeholder="Ex: Easy Menu Premium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase opacity-60">Slug da Loja (URL)</label>
                  <input 
                    type="text" 
                    className="w-full p-3 rounded-xl border border-gray-300 bg-gray-50"
                    value={settings?.slug || ''}
                    onChange={e => setSettings({...settings, slug: slugify(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold uppercase opacity-60">País & WhatsApp de Atendimento</label>
                    {(() => {
                      const currentCountry = COUNTRY_OPTIONS[settings?.whatsappCountryCode || '+55'] || COUNTRY_OPTIONS['+55'];
                      return (
                        <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                          {currentCountry.flag} {currentCountry.name} ({currentCountry.code})
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select 
                      className="p-3 rounded-xl border border-gray-300 bg-white font-bold w-full sm:w-56 text-sm"
                      value={settings?.whatsappCountryCode || '+55'}
                      onChange={e => {
                        const newCode = e.target.value;
                        const newCountry = COUNTRY_OPTIONS[newCode];
                        setSettings({
                          ...settings, 
                          whatsappCountryCode: newCode,
                          whatsappNumber: formatPhoneByCountry(settings?.whatsappNumber || '', newCode),
                          currency: settings?.currency || newCountry?.defaultCurrency || 'BRL'
                        });
                      }}
                    >
                      <option value="+55">🇧🇷 Brasil (+55)</option>
                      <option value="+1">🇺🇸 Estados Unidos (+1)</option>
                      <option value="+351">🇵🇹 Portugal (+351)</option>
                      <option value="+34">🇪🇸 Espanha (+34)</option>
                    </select>
                    {(() => {
                      const countryCfg = COUNTRY_OPTIONS[settings?.whatsappCountryCode || '+55'] || COUNTRY_OPTIONS['+55'];
                      return (
                        <input 
                          type="text" 
                          className="flex-grow p-3 rounded-xl border border-gray-300 w-full bg-white text-black font-semibold"
                          value={formatPhoneByCountry(settings?.whatsappNumber || '', settings?.whatsappCountryCode || '+55')}
                          onChange={e => setSettings({...settings, whatsappNumber: formatPhoneByCountry(e.target.value, settings?.whatsappCountryCode || '+55')})}
                          placeholder={countryCfg.placeholder}
                        />
                      );
                    })()}
                  </div>
                  {(() => {
                    const countryCfg = COUNTRY_OPTIONS[settings?.whatsappCountryCode || '+55'] || COUNTRY_OPTIONS['+55'];
                    const numDigits = (settings?.whatsappNumber || '').replace(/\D/g, '').length;
                    if (settings?.whatsappNumber && numDigits < countryCfg.minDigits) {
                      return (
                        <p className="text-xs text-amber-600 font-semibold mt-1">
                          ⚠️ Atenção: O número digitado tem {numDigits} dígitos (mínimo de {countryCfg.minDigits} para {countryCfg.name}). Formato esperado: {countryCfg.placeholder}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase opacity-60">Senha do Painel Adm</label>
                  <input 
                    type="text" 
                    className="w-full p-3 rounded-xl border border-gray-300"
                    value={settings?.adminPassword || ''}
                    onChange={e => setSettings({...settings, adminPassword: e.target.value})}
                    placeholder="admin123"
                  />
                </div>
              </div>

              {/* SELEÇÃO DE MOEDA DO SISTEMA */}
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-amber-950 flex items-center gap-2">
                      💰 Moeda Padrão do Sistema
                    </h4>
                    <p className="text-xs text-amber-900/80 font-medium">
                      Escolha a moeda que será exibida em todo o cardápio, checkout, pedidos, comanda e relatórios.
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-white font-extrabold text-xs rounded-full border border-amber-300 text-amber-900 shadow-sm shrink-0">
                    Ativo: {settings?.currency || 'BRL'} ({currencySymbol})
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {CURRENCY_OPTIONS.map(curr => {
                    const isSelected = (settings?.currency || 'USD') === curr.code;
                    return (
                      <button
                        key={curr.code}
                        type="button"
                        onClick={() => setSettings({ ...settings, currency: curr.code })}
                        className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-white border-amber-500 shadow-md ring-2 ring-amber-500/30'
                            : 'bg-white/60 border-amber-200/60 hover:bg-white hover:border-amber-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-gray-900">{curr.flag} {curr.code}</span>
                          <span className="text-base font-black px-2 py-0.5 bg-amber-100/70 rounded-lg text-amber-900">
                            {curr.symbol}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1 font-medium">{curr.name}</p>
                        <div className="mt-2 text-[11px] font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200/50">
                          Ex: {curr.preview}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* EASY TOTEM — SELF-SERVICE KIOSK (USA EDITION) */}
              <div className="p-6 rounded-3xl bg-white/85 backdrop-blur-md border border-stone-300/80 shadow-md space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-800">
                      Configuração do Totem de Autoatendimento
                    </span>
                    <h3 className="text-2xl font-serif font-black text-stone-900 flex items-center gap-2 mt-0.5">
                      <Monitor size={22} /> Easy Kioski — Edição EUA
                    </h3>
                    <p className="text-xs text-stone-600 font-medium mt-1">
                      Idioma padrão do totem, imposto estadual (EUA), terminal de pagamento (Square / Zettle), dupla impressão 80mm e restauração do catálogo base.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenKDS) onOpenKDS();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:bg-stone-800 cursor-pointer shrink-0"
                  >
                    <ChefHat size={16} /> Abrir Tela da Cozinha
                  </button>
                </div>

                {/* Idioma, Imposto, Inatividade e Mesa/Pager */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-600">
                      Idioma Padrão do Totem
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200">
                      {([
                        { id: 'en', label: 'EN (EUA)' },
                        { id: 'es', label: 'ES' },
                        { id: 'pt', label: 'PT' },
                      ] as const).map((opt) => {
                        const active = (settings?.language || 'en') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSettings({ ...settings, language: opt.id })}
                            className={cn(
                              'py-2 rounded-lg text-xs font-black transition-all cursor-pointer',
                              active ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-700 hover:bg-white'
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                      <Percent size={13} /> Taxa de Imposto Estadual (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="30"
                      className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-bold text-stone-900"
                      value={settings?.salesTaxRate ?? 7.75}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          salesTaxRate: e.target.value === '' ? 0 : parseFloat(e.target.value),
                        })
                      }
                      placeholder="7.75"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                      <Clock size={13} /> Reinício por Inatividade (seg)
                    </label>
                    <input
                      type="number"
                      min="15"
                      max="300"
                      className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-bold text-stone-900"
                      value={settings?.kioskInactivitySeconds ?? 45}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          kioskInactivitySeconds: Math.max(15, parseInt(e.target.value, 10) || 45),
                        })
                      }
                      placeholder="45"
                    />
                  </div>
                </div>

                {/* Solicitar Mesa ou Pager */}
                <label className="flex items-center justify-between p-4 rounded-2xl bg-stone-50 border border-stone-200 cursor-pointer">
                  <div>
                    <p className="text-sm font-bold text-stone-900">Solicitar Número da Mesa / Pager na Finalização</p>
                    <p className="text-xs text-stone-600">
                      Exibe o campo opcional de número da mesa ou pager no Passo 1 do Totem (ideal para pedidos com entrega na mesa).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.askTableOrPager)}
                    onChange={(e) => setSettings({ ...settings, askTableOrPager: e.target.checked })}
                    className="w-5 h-5 accent-stone-900 cursor-pointer"
                  />
                </label>

                {/* PAGAMENTOS NO TOTEM (QR CODE & CONFIRMAÇÃO AUTOMÁTICA POR E-MAIL) */}
                <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">
                        Exclusivo para o Totem na Loja
                      </span>
                      <h4 className="text-base font-serif font-black text-stone-900 flex items-center gap-2 mt-0.5">
                        <QrCode size={18} /> Pagamentos no Totem (QR Code & Confirmação Automática)
                      </h4>
                      <p className="text-xs text-stone-600 mt-0.5">
                        Gere QR Codes dinâmicos na hora (Venmo, PayPal e Cash App) com valor exato e confirmação automática via Gmail (Google Apps Script). Os valores padrão de demonstração podem ser substituídos pelo seu usuário a qualquer momento.
                      </p>
                    </div>
                  </div>

                  {/* 1. Identificadores do Lojista */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                        Venmo Username
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-mono"
                        value={settings?.venmoUsername ?? 'easykioski-demo'}
                        onChange={(e) => setSettings({ ...settings, venmoUsername: e.target.value })}
                        placeholder="@nome-do-restaurante"
                      />
                      {settings?.venmoUsername?.trim() && (
                        <p className="text-[10px] text-emerald-700 font-semibold">
                          Link gerado: venmo.com/{sanitizeVenmoUsername(settings.venmoUsername)}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                        PayPal.me Username
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-mono"
                        value={settings?.paypalMeUsername ?? 'easykioskidemo'}
                        onChange={(e) => setSettings({ ...settings, paypalMeUsername: e.target.value })}
                        placeholder="nome-do-restaurante"
                      />
                      {settings?.paypalMeUsername?.trim() && (
                        <p className="text-[10px] text-emerald-700 font-semibold">
                          Link gerado: paypal.me/{sanitizePaypalUsername(settings.paypalMeUsername)}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                        Cash App $Cashtag
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-mono"
                        value={settings?.cashAppTag ?? 'easykioskidemo'}
                        onChange={(e) => setSettings({ ...settings, cashAppTag: e.target.value })}
                        placeholder="$nome-do-restaurante"
                      />
                      {settings?.cashAppTag?.trim() && (
                        <p className="text-[10px] text-emerald-700 font-semibold">
                          Link gerado: cash.app/${sanitizeCashAppTag(settings.cashAppTag)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Toggles: Pay at Counter + Modo Demonstração */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-stone-200 cursor-pointer">
                      <div>
                        <p className="text-xs font-bold text-stone-900">Permitir "Pagar no Balcão" (link discreto no rodapé)</p>
                        <p className="text-[11px] text-stone-500">
                          Exibe um link discreto no rodapé da tela de pagamento para clientes que preferirem pagar em dinheiro ou cartão no caixa.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings?.allowPayAtCounter !== false}
                        onChange={(e) => setSettings({ ...settings, allowPayAtCounter: e.target.checked })}
                        className="w-5 h-5 accent-stone-900 cursor-pointer shrink-0"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-stone-200 cursor-pointer">
                      <div>
                        <p className="text-xs font-bold text-stone-900">Modo Demonstração (Apresentação Comercial)</p>
                        <p className="text-[11px] text-stone-500">
                          Exibe botão discreto "Simulate Payment Approved" no Totem para testes e demos ao vivo.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(settings?.totemDemoMode)}
                        onChange={(e) => setSettings({ ...settings, totemDemoMode: e.target.checked })}
                        className="w-5 h-5 accent-emerald-700 cursor-pointer shrink-0"
                      />
                    </label>
                  </div>

                  {/* 2. Chave Secreta de Webhook */}
                  <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="text-[11px] font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                        <KeyRound size={14} /> Chave Secreta de Webhook (emailWebhookSecret)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const secret = settings?.emailWebhookSecret || generateSecureWebhookSecret(32);
                            navigator.clipboard.writeText(secret);
                            toast.success('Chave secreta copiada!');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-[11px] font-bold flex items-center gap-1.5 hover:bg-stone-800 cursor-pointer"
                        >
                          <Copy size={12} /> Copiar Chave
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextSecret = generateSecureWebhookSecret(32);
                            setSettings({ ...settings, emailWebhookSecret: nextSecret });
                            toast.info('Nova chave secreta gerada! Lembre-se de salvar e atualizar no Apps Script.');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw size={12} /> Gerar Nova
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      readOnly
                      className="w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 text-xs font-mono text-stone-800 select-all"
                      value={settings?.emailWebhookSecret || ''}
                    />
                  </div>

                  {/* 3. Card Colapsável com o Código Pronto do Google Apps Script */}
                  <div className="rounded-2xl border border-stone-300 bg-white overflow-hidden shadow-xs">
                    <button
                      type="button"
                      onClick={() => setShowAppsScriptCode((prev) => !prev)}
                      className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-stone-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Code2 size={18} className="text-amber-800 shrink-0" />
                        <span className="text-xs sm:text-sm font-black text-stone-900">
                          📜 Código Pronto do Google Apps Script (Copiar e Colar no Gmail do Lojista)
                        </span>
                      </div>
                      {showAppsScriptCode ? <ChevronUp size={18} className="text-stone-500 shrink-0" /> : <ChevronDown size={18} className="text-stone-500 shrink-0" />}
                    </button>

                    {showAppsScriptCode && (
                      <div className="p-4 pt-2 border-t border-stone-200 space-y-4 bg-stone-50/70">
                        {/* Instruções em 3 passos simples */}
                        <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 space-y-1.5 text-xs text-stone-800">
                          <p className="font-black text-amber-950 uppercase tracking-wider text-[11px]">
                            Como ativar a confirmação automática em 3 passos simples:
                          </p>
                          <ol className="list-decimal list-inside space-y-1 font-medium">
                            <li>
                              Acesse <strong className="font-mono">script.google.com</strong> logado na conta do Gmail que recebe as notificações de <strong>Venmo, PayPal, Cash App e Zelle</strong>, e clique em <strong>Novo Projeto</strong>.
                            </li>
                            <li>
                              Apague o código inicial, cole o código abaixo (já configurado com o seu Firebase <strong className="font-mono">{FIREBASE_PROJECT_ID}</strong> e sua chave secreta) e clique em <strong>Salvar</strong>.
                            </li>
                            <li>
                              Selecione a função <strong className="font-mono">setupOneMinuteTrigger</strong> no topo e clique em <strong>Executar</strong> (aceite as permissões do Gmail). Pronto! Ele verificará novos pagamentos a cada 1 minuto automaticamente.
                            </li>
                          </ol>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                            Script completo (.gs) pronto para uso
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const code = generateGoogleAppsScriptCode({
                                projectId: FIREBASE_PROJECT_ID,
                                webhookSecret: settings?.emailWebhookSecret || '',
                              });
                              navigator.clipboard.writeText(code);
                              toast.success('Código completo do Google Apps Script copiado!');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Copy size={13} /> Copiar Código Completo (.gs)
                          </button>
                        </div>

                        <pre className="w-full max-h-80 overflow-auto p-4 rounded-xl bg-stone-950 text-emerald-300 text-[11px] font-mono leading-relaxed border border-stone-800 select-all">
                          {generateGoogleAppsScriptCode({
                            projectId: FIREBASE_PROJECT_ID,
                            webhookSecret: settings?.emailWebhookSecret || '',
                          })}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                {/* Terminal de Pagamento */}
                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-sm font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                      <CreditCard size={16} /> Terminal de Pagamento (Maquininha EUA)
                    </h4>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white border border-stone-200 text-stone-700">
                      {(settings?.terminalProvider || 'simulation') === 'simulation'
                        ? 'Modo Demonstração (Botão Simular Ativo)'
                        : (settings?.terminalProvider || '').toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {([
                      { id: 'simulation', title: 'Simulação / Demonstração', desc: 'Ativa botão discreto de aprovação para testes' },
                      { id: 'square', title: 'Square Terminal', desc: 'Integração física Square (EUA)' },
                      { id: 'zettle', title: 'PayPal Zettle', desc: 'Integração leitor PayPal Zettle' },
                    ] as const).map((prov) => {
                      const active = (settings?.terminalProvider || 'simulation') === prov.id;
                      return (
                        <button
                          key={prov.id}
                          type="button"
                          onClick={() => setSettings({ ...settings, terminalProvider: prov.id })}
                          className={cn(
                            'p-3 rounded-xl border text-left transition-all cursor-pointer',
                            active
                              ? 'bg-white border-stone-900 ring-2 ring-stone-900/15 shadow-sm'
                              : 'bg-white/60 border-stone-200 hover:bg-white'
                          )}
                        >
                          <div className="text-xs font-black text-stone-900">{prov.title}</div>
                          <div className="text-[11px] text-stone-500 mt-0.5">{prov.desc}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                        Chave de API / Token de Acesso
                      </label>
                      <input
                        type="password"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-mono"
                        value={settings?.terminalApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, terminalApiKey: e.target.value })}
                        placeholder="sq0atp-... ou Token Zettle"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                        ID do Dispositivo (Terminal)
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-mono"
                        value={settings?.terminalDeviceId || ''}
                        onChange={(e) => setSettings({ ...settings, terminalDeviceId: e.target.value })}
                        placeholder="ex: 9fa747a2-25ff-48ee-b078..."
                      />
                    </div>
                  </div>
                </div>

                {/* Dual 80mm Thermal Printers (QZ Tray) */}
                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                        <Printer size={16} /> Impressão Dupla Simultânea 80mm (QZ Tray)
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Via 1 imprime o recibo do cliente no Totem; Via 2 imprime a comanda da cozinha com modificações em caixa alta.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestDualPrint}
                      disabled={isTestingDualPrint}
                      className="px-4 py-2 rounded-xl bg-white border border-stone-300 hover:bg-stone-100 text-xs font-bold text-stone-900 flex items-center gap-2 cursor-pointer shrink-0"
                    >
                      {isTestingDualPrint ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                      Testar Impressão Dupla 80mm
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                        Impressora do Totem (Via 1 — Cliente)
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm"
                        value={settings?.kioskPrinterName || ''}
                        onChange={(e) => setSettings({ ...settings, kioskPrinterName: e.target.value })}
                        placeholder="ex: EPSON TM-T88V Kiosk"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                        Impressora da Cozinha/Balcão (Via 2 — Produção)
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm"
                        value={settings?.kitchenPrinterName || ''}
                        onChange={(e) => setSettings({ ...settings, kitchenPrinterName: e.target.value })}
                        placeholder="ex: Star TSP143III Kitchen"
                      />
                    </div>
                  </div>
                </div>

                {/* Configurações do Modo Mobile Pickup (App Externo de Retirada Agendada) */}
                <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                        <Smartphone size={16} /> Retirada Agendada & Pagamento Direto (Mobile Pickup)
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Usa os mesmos identificadores de <strong>Venmo, PayPal, Cash App</strong> e o <strong>Google Apps Script</strong> configurados acima (taxa zero!), com abertura direta no celular do cliente e suporte opcional a <strong>Zelle</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                        Tempo Médio ASAP (min)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={180}
                        step={5}
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900"
                        value={settings?.defaultPrepMinutes ?? 25}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            defaultPrepMinutes: Math.max(5, parseInt(e.target.value || '25', 10)),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                        Abertura para Retirada
                      </label>
                      <input
                        type="time"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900"
                        value={settings?.pickupOpenTime || '09:00'}
                        onChange={(e) => setSettings({ ...settings, pickupOpenTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                        Fechamento para Retirada
                      </label>
                      <input
                        type="time"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900"
                        value={settings?.pickupCloseTime || '21:00'}
                        onChange={(e) => setSettings({ ...settings, pickupCloseTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                        Intervalo das Janelas
                      </label>
                      <select
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900"
                        value={settings?.pickupSlotIntervalMinutes ?? 15}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            pickupSlotIntervalMinutes: parseInt(e.target.value, 10),
                          })
                        }
                      >
                        <option value={15}>A cada 15 minutos</option>
                        <option value={30}>A cada 30 minutos</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                        Zelle Email / Telefone (Opcional para pedidos antecipados)
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-mono"
                        value={settings?.zelleIdentifier || ''}
                        onChange={(e) =>
                          setSettings({ ...settings, zelleIdentifier: e.target.value })
                        }
                        placeholder="ex: pagamentos@seurestaurante.com ou (555) 123-4567"
                      />
                      <p className="text-[10px] text-stone-500">
                        Exibe cartão Zelle com botão &quot;Copiar Zelle e Valor&quot; e número do pedido no celular do cliente.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white border border-stone-200 flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-xs font-black text-stone-900">
                          Só enviar Mobile Pickup para a Cozinha/Impressora após pagamento confirmado
                        </div>
                        <p className="text-[11px] text-stone-500 leading-snug">
                          Recomendado ativo: evita produzir pedidos abandonados antes do cliente pagar.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={settings?.mobilePickupRequirePaidForKds !== false}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              mobilePickupRequirePaidForKds: e.target.checked,
                            })
                          }
                        />
                        <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="text-xl font-serif font-bold">Idioma e Checkout</h3>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase opacity-60">Título do Checkout (Abaixo de "Detalhes do Pedido")</label>
                  <textarea 
                    rows={2}
                    className="w-full p-3 rounded-xl border border-gray-300"
                    value={settings?.checkoutTitle || ''}
                    onChange={e => setSettings({...settings, checkoutTitle: e.target.value})}
                    placeholder="Ex: Ficamos muito felizes com seu pedido!..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3 p-4 bg-white/50 rounded-2xl border border-gray-100">
                    <label className="text-xs font-bold uppercase opacity-60">Bloco Informativo 1</label>
                    <input 
                      type="text" 
                      className="w-full p-2 rounded-lg border border-gray-200 text-sm font-bold"
                      value={settings?.infoBlock1Title || ''}
                      onChange={e => setSettings({...settings, infoBlock1Title: e.target.value})}
                      placeholder="Título (Ex: CONFIRMAÇÃO DO PEDIDO)"
                    />
                    <textarea 
                      rows={3}
                      className="w-full p-2 rounded-lg border border-gray-200 text-sm"
                      value={settings?.infoBlock1Text || ''}
                      onChange={e => setSettings({...settings, infoBlock1Text: e.target.value})}
                      placeholder="Texto informativo..."
                    />
                  </div>
                  <div className="space-y-3 p-4 bg-white/50 rounded-2xl border border-gray-100">
                    <label className="text-xs font-bold uppercase opacity-60">Bloco Informativo 2</label>
                    <input 
                      type="text" 
                      className="w-full p-2 rounded-lg border border-gray-200 text-sm font-bold"
                      value={settings?.infoBlock2Title || ''}
                      onChange={e => setSettings({...settings, infoBlock2Title: e.target.value})}
                      placeholder="Título (Ex: RETIRADA NO LOCAL)"
                    />
                    <textarea 
                      rows={3}
                      className="w-full p-2 rounded-lg border border-gray-200 text-sm"
                      value={settings?.infoBlock2Text || ''}
                      onChange={e => setSettings({...settings, infoBlock2Text: e.target.value})}
                      placeholder="Texto informativo..."
                    />
                  </div>
                </div>
              </div>

              {/* CONFIGURAÇÃO DA TELA DE BOAS VINDAS (TELA 1) */}
              <div className="glass p-6 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif font-bold text-lg text-black">Tela de Boas-Vindas (Apresentação)</h4>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={settings?.introEnabled !== false}
                      onChange={e => setSettings({...settings, introEnabled: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700"></div>
                    <span className="ml-2 text-xs font-bold uppercase opacity-65 text-black">Ativada</span>
                  </label>
                </div>
                
                {settings?.introEnabled !== false && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase opacity-50 text-black">Título Principal</label>
                        <input 
                          type="text" 
                          className="w-full p-2.5 rounded-xl border border-gray-300 text-sm bg-white"
                          value={settings?.introTitle || ''}
                          onChange={e => setSettings({...settings, introTitle: e.target.value})}
                          placeholder="Ex: Escola de gastronomia"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase opacity-50 text-black">Texto do Botão</label>
                        <input 
                          type="text" 
                          className="w-full p-2.5 rounded-xl border border-gray-300 text-sm bg-white"
                          value={settings?.introButtonText || ''}
                          onChange={e => setSettings({...settings, introButtonText: e.target.value})}
                          placeholder="Ex: INICIAR OPERAÇÃO"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase opacity-50 text-black">Subtítulo Prato/Frase Cursiva</label>
                      <input 
                        type="text" 
                        className="w-full p-2.5 rounded-xl border border-gray-300 text-sm font-medium bg-white"
                        value={settings?.introSubtitle || ''}
                        onChange={e => setSettings({...settings, introSubtitle: e.target.value})}
                        placeholder="Ex: From sacred nature to your plate"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase opacity-50 text-black">Texto de Apresentação (Pequeno)</label>
                      <textarea 
                        rows={2}
                        className="w-full p-2.5 rounded-xl border border-gray-300 text-sm bg-white"
                        value={settings?.introDescription || ''}
                        onChange={e => setSettings({...settings, introDescription: e.target.value})}
                        placeholder="Ex: Descrição sobre o propósito do restaurante..."
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase opacity-50 text-black">Texto Inferior (Rodapé)</label>
                      <input 
                        type="text" 
                        className="w-full p-2.5 rounded-xl border border-gray-300 text-sm font-mono bg-white"
                        value={settings?.introBottomText || ''}
                        onChange={e => setSettings({...settings, introBottomText: e.target.value})}
                        placeholder="Ex: EASY KIOSKI · SELF-SERVICE KIOSK"
                      />
                    </div>

                    {/* Botão Tradução Instantânea EN / ES / PT para Textos da Tela Inicial */}
                    <div className="pt-2 border-t border-gray-200 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleAutoTranslateIntroTexts}
                          disabled={isTranslatingIntro}
                          className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          {isTranslatingIntro ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          <span>
                            {isTranslatingIntro
                              ? 'Traduzindo frases para EN / ES / PT...'
                              : '✨ Traduzir Textos da Tela Inicial para EN / ES / PT'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowIntroTranslations((prev) => !prev)}
                          className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Globe size={13} />
                          <span>{showIntroTranslations ? 'Ocultar Traduções' : 'Ver / Editar Traduções EN / ES / PT'}</span>
                        </button>
                      </div>

                      {showIntroTranslations && (
                        <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                          <div className="flex items-center gap-1.5">
                            {(['en', 'es', 'pt'] as const).map((lng) => (
                              <button
                                key={lng}
                                type="button"
                                onClick={() => setIntroTranslationTab(lng)}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg text-xs font-black uppercase cursor-pointer transition-all',
                                  introTranslationTab === lng
                                    ? 'bg-stone-900 text-white'
                                    : 'bg-white text-stone-700 border border-stone-200'
                                )}
                              >
                                {lng === 'en' ? '🇺🇸 Inglês (EN)' : lng === 'es' ? '🇪🇸 Espanhol (ES)' : '🇧🇷 Português (PT)'}
                              </button>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-stone-500">
                                Subtítulo Cursivo ({introTranslationTab.toUpperCase()})
                              </label>
                              <input
                                type="text"
                                className="w-full p-2 rounded-lg border border-stone-300 bg-white text-xs"
                                value={
                                  introTranslationTab === 'en'
                                    ? settings?.introSubtitle_en || ''
                                    : introTranslationTab === 'es'
                                      ? settings?.introSubtitle_es || ''
                                      : settings?.introSubtitle_pt || ''
                                }
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    ...(introTranslationTab === 'en'
                                      ? { introSubtitle_en: e.target.value }
                                      : introTranslationTab === 'es'
                                        ? { introSubtitle_es: e.target.value }
                                        : { introSubtitle_pt: e.target.value }),
                                  })
                                }
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-stone-500">
                                Texto do Botão ({introTranslationTab.toUpperCase()})
                              </label>
                              <input
                                type="text"
                                className="w-full p-2 rounded-lg border border-stone-300 bg-white text-xs"
                                value={
                                  introTranslationTab === 'en'
                                    ? settings?.introButtonText_en || ''
                                    : introTranslationTab === 'es'
                                      ? settings?.introButtonText_es || ''
                                      : settings?.introButtonText_pt || ''
                                }
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    ...(introTranslationTab === 'en'
                                      ? { introButtonText_en: e.target.value }
                                      : introTranslationTab === 'es'
                                        ? { introButtonText_es: e.target.value }
                                        : { introButtonText_pt: e.target.value }),
                                  })
                                }
                              />
                            </div>

                            <div className="space-y-1 sm:col-span-2">
                              <label className="text-[10px] font-bold uppercase text-stone-500">
                                Texto de Apresentação ({introTranslationTab.toUpperCase()})
                              </label>
                              <textarea
                                rows={2}
                                className="w-full p-2 rounded-lg border border-stone-300 bg-white text-xs"
                                value={
                                  introTranslationTab === 'en'
                                    ? settings?.introDescription_en || ''
                                    : introTranslationTab === 'es'
                                      ? settings?.introDescription_es || ''
                                      : settings?.introDescription_pt || ''
                                }
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    ...(introTranslationTab === 'en'
                                      ? { introDescription_en: e.target.value }
                                      : introTranslationTab === 'es'
                                        ? { introDescription_es: e.target.value }
                                        : { introDescription_pt: e.target.value }),
                                  })
                                }
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-stone-500">
                                Texto Inferior / Rodapé ({introTranslationTab.toUpperCase()})
                              </label>
                              <input
                                type="text"
                                className="w-full p-2 rounded-lg border border-stone-300 bg-white text-xs font-mono"
                                value={
                                  introTranslationTab === 'en'
                                    ? settings?.introBottomText_en || ''
                                    : introTranslationTab === 'es'
                                      ? settings?.introBottomText_es || ''
                                      : settings?.introBottomText_pt || ''
                                }
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    ...(introTranslationTab === 'en'
                                      ? { introBottomText_en: e.target.value }
                                      : introTranslationTab === 'es'
                                        ? { introBottomText_es: e.target.value }
                                        : { introBottomText_pt: e.target.value }),
                                  })
                                }
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-stone-500">
                                Slogan do Cardápio ({introTranslationTab.toUpperCase()})
                              </label>
                              <input
                                type="text"
                                className="w-full p-2 rounded-lg border border-stone-300 bg-white text-xs"
                                value={
                                  introTranslationTab === 'en'
                                    ? settings?.slogan_en || ''
                                    : introTranslationTab === 'es'
                                      ? settings?.slogan_es || ''
                                      : settings?.slogan_pt || ''
                                }
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    ...(introTranslationTab === 'en'
                                      ? { slogan_en: e.target.value }
                                      : introTranslationTab === 'es'
                                        ? { slogan_es: e.target.value }
                                        : { slogan_pt: e.target.value }),
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* CONFIGURAÇÃO DO CARDÁPIO PRINCIPAL (CARDÁPIO ÚNICO - IMAGEM 1) */}
              <div className="glass p-6 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <div>
                    <h4 className="font-serif font-bold text-lg text-black">Configurações do Cardápio Principal</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Seu aplicativo opera em modo Cardápio Único. Todos os seus pratos e categorias são exibidos de forma unificada.
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold border border-green-200">
                    ✓ Cardápio Único Ativo
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="sm:col-span-2 space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase opacity-60 text-gray-700">Título do Cardápio</label>
                      <input 
                        type="text" 
                        className="w-full p-2.5 rounded-xl border border-gray-300 text-sm font-bold bg-white"
                        value={settings?.catalog1Title || ''}
                        onChange={e => setSettings({...settings, catalog1Title: e.target.value})}
                        placeholder="Ex: Cardápio Principal"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase opacity-60 text-gray-700">Descrição / Subtítulo do Cardápio</label>
                      <input 
                        type="text" 
                        className="w-full p-2.5 rounded-xl border border-gray-300 text-sm bg-white text-black"
                        value={settings?.catalog1Desc || ''}
                        onChange={e => setSettings({...settings, catalog1Desc: e.target.value})}
                        placeholder="Ex: Nossos produtos e opções exclusivas"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase opacity-60 text-gray-700">Slogan / Frase de Destaque no Cabeçalho</label>
                      <textarea 
                        rows={3}
                        className="w-full p-2.5 rounded-xl border border-gray-300 text-xs bg-white text-black font-medium resize-y"
                        value={settings?.catalog1Slogan || ''}
                        onChange={e => setSettings({...settings, catalog1Slogan: e.target.value})}
                        placeholder="Ex: Qualidade e sabor incomparáveis a cada mordida!"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 flex flex-col items-center">
                    <label className="text-[10px] font-bold uppercase opacity-60 self-start text-gray-700">Imagem de Capa</label>
                    <div className="w-full h-32 rounded-2xl bg-white border border-gray-300 flex items-center justify-center overflow-hidden mb-1 shadow-sm relative">
                      {settings?.catalog1Image ? (
                        <img src={settings.catalog1Image} alt="Capa do Cardápio" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-gray-400 font-semibold">Sem Imagem</span>
                      )}
                    </div>
                    <input 
                      type="file" 
                      id="catalog1-upload"
                      accept="image/*"
                      onChange={e => handleFileChange(e, (b64) => setSettings({...settings, catalog1Image: b64}), 'catalog')}
                      className="hidden"
                    />
                    <label 
                      htmlFor="catalog1-upload"
                      className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-50 text-black text-center w-full shadow-xs"
                    >
                      Alterar Capa
                    </label>
                  </div>
                </div>
              </div>

              {/* Link Externo & QR Code para Clientes (Mobile Pickup) */}
              <div className="glass rounded-3xl p-8 space-y-6 border border-black/10">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-black/5 text-gray-700 mb-1">
                    <Smartphone size={13} /> App Mobile Externo · Retirada Agendada
                  </div>
                  <h3 className="text-2xl font-serif font-medium" style={{ color: settings?.textColor || 'inherit' }}>
                    Link Externo & QR Code para Clientes (Mobile Pickup)
                  </h3>
                  <p className="opacity-60 text-sm" style={{ color: settings?.textColor || 'inherit' }}>
                    Compartilhe este link no Instagram, WhatsApp ou em materiais impressos para o cliente pedir pelo celular e retirar sem fila (sem timer de inatividade):
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <div
                        className="flex-grow w-full glass p-4 rounded-2xl font-mono text-xs break-all border border-black/10"
                        style={{ color: settings?.textColor || 'inherit' }}
                      >
                        {`${window.location.origin}/order`}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const mobileUrl = `${window.location.origin}/order`;
                          navigator.clipboard.writeText(mobileUrl);
                          setCopiedMobileLink(true);
                          toast.success('Link Mobile Pickup copiado!');
                          setTimeout(() => setCopiedMobileLink(false), 2000);
                        }}
                        className="w-full sm:w-auto px-5 py-3 rounded-xl font-bold transition-all uppercase tracking-wider text-xs active:scale-95 text-center cursor-pointer border border-black/10 hover:bg-black/5 whitespace-nowrap"
                        style={{ color: settings?.primaryColor || '#601a4f' }}
                      >
                        {copiedMobileLink ? 'COPIADO!' : 'COPIAR LINK'}
                      </button>
                    </div>

                    <div className="text-xs opacity-60 space-y-2 leading-relaxed" style={{ color: settings?.textColor || 'inherit' }}>
                      <p>
                        📱 <strong>Instalação PWA:</strong> Ao abrir este link no celular, o cliente vê um convite discreto para adicionar o app na tela inicial do iPhone ou Android.
                      </p>
                      <p>
                        ⚡ <strong>Integrado à Cozinha:</strong> Pedidos pagos pelo celular chegam automaticamente na Tela da Cozinha (KDS) com destaque <strong>MOBILE PICKUP</strong> e horário agendado.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-black/10 space-y-3">
                    <div className="p-3 bg-white rounded-xl shadow-md">
                      <QRCodeCanvas
                        id="mobile-pickup-qr-canvas"
                        value={`${window.location.origin}/order`}
                        size={148}
                        includeMargin
                        bgColor="#ffffff"
                        fgColor="#111111"
                        level="M"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const canvas = document.getElementById('mobile-pickup-qr-canvas') as HTMLCanvasElement | null;
                          if (!canvas) {
                            toast.error('QR Code ainda não carregado.');
                            return;
                          }
                          const dataUrl = canvas.toDataURL('image/png');
                          const a = document.createElement('a');
                          a.href = dataUrl;
                          a.download = `qrcode-mobile-pickup-${settings?.slug || 'easy-kioski'}.png`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          toast.success('QR Code Mobile Pickup (PNG) baixado com sucesso!');
                        } catch (error) {
                          console.error('Error downloading Mobile Pickup QR code:', error);
                          toast.error('Não foi possível baixar o QR Code.');
                        }
                      }}
                      className="w-full py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 cursor-pointer text-black shadow-sm"
                      style={{ backgroundColor: '#efedea', color: '#000000' }}
                    >
                      <Download size={14} className="text-black" />
                      <span className="text-black">Baixar QR Code (PNG)</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="glass rounded-3xl p-8 space-y-6">
                <div className="space-y-1">
                  <h3 className="text-2xl font-serif font-medium" style={{ color: settings?.textColor || 'inherit' }}>Link do Modo Totem (Loja Física)</h3>
                  <p className="opacity-40 text-sm" style={{ color: settings?.textColor || 'inherit' }}>Use este endereço no tablet/totem de autoatendimento dentro da loja:</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <div className="flex-grow w-full glass p-4 rounded-2xl font-mono text-xs break-all border border-white/10" style={{ color: settings?.textColor || 'inherit' }}>
                        {`${window.location.origin}/?slug=${settings?.slug || 'easy-cake-menu'}`}
                      </div>
                      <button 
                        onClick={copyLink}
                        className="w-full sm:w-auto px-5 py-3 rounded-xl font-bold transition-all uppercase tracking-wider text-xs active:scale-95 text-center cursor-pointer border border-white/10 hover:bg-white/5 whitespace-nowrap"
                        style={{ color: settings?.primaryColor || '#865d39' }}
                      >
                        {copied ? 'COPIADO!' : 'COPIAR LINK'}
                      </button>
                    </div>

                    <div className="text-xs opacity-50 space-y-2 leading-relaxed" style={{ color: settings?.textColor || 'inherit' }}>
                      <p>💡 <strong>Dica de Sucesso:</strong> Imprima o QR Code e coloque-o nas suas mesas, no balcão de atendimento ou nas embalagens de entrega para que os clientes acessem seu cardápio instantaneamente!</p>
                      <p>📸 Você também pode publicá-lo nos Stories do Instagram, enviar no WhatsApp ou colocar no link da sua bio.</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                    <div className="p-3 bg-white rounded-xl shadow-md">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/?slug=${settings?.slug || 'easy-cake-menu'}`)}`}
                        alt="QR Code do Cardápio" 
                        className="w-32 h-32 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const appLink = `${window.location.origin}/?slug=${settings?.slug || 'easy-cake-menu'}`;
                          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(appLink)}`;
                          const response = await fetch(qrUrl);
                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `qrcode-cardapio-${settings?.slug || 'menu'}.png`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          window.URL.revokeObjectURL(url);
                          toast.success('QR Code baixado com sucesso!');
                        } catch (error) {
                          console.error('Error downloading QR code:', error);
                          const appLink = `${window.location.origin}/?slug=${settings?.slug || 'easy-cake-menu'}`;
                          window.open(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(appLink)}`, '_blank');
                        }
                      }}
                      className="w-full py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 cursor-pointer text-black shadow-sm"
                      style={{ backgroundColor: '#efedea', color: '#000000' }}
                    >
                      <Download size={14} className="text-black" />
                      <span className="text-black">Baixar QR Code</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4 items-center">
                <button 
                  onClick={saveSettings}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold shadow-lg disabled:opacity-50"
                  style={{ 
                    backgroundColor: settings?.primaryColor || '#865d39',
                    color: getContrastText(settings?.primaryColor || '#865d39')
                  }}
                >
                  {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                  Salvar Alterações
                </button>
                <AnimatePresence>
                  {saveSuccess && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-xl font-bold shadow-sm border border-green-200"
                    >
                      <CheckCircle2 size={18} /> Salvo com sucesso!
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}




        {activeTab === 'categories' && (
          <div className="max-w-3xl space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-3xl font-serif font-bold">Gerenciar Categorias</h2>
              <button
                type="button"
                disabled={isBulkTranslating}
                onClick={handleBulkTranslateCatalog}
                className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-60"
              >
                {isBulkTranslating ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />}
                {isBulkTranslating
                  ? 'Traduzindo...'
                  : `Traduzir Pendentes (${countPendingCatalogTranslations(categories, products, sides)})`}
              </button>
            </div>

            {bulkTranslationProgress && (
              <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-amber-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                  <span className="truncate">{bulkTranslationProgress.currentLabel}</span>
                  <span className="shrink-0 tabular-nums">
                    {bulkTranslationProgress.completed} / {bulkTranslationProgress.total}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${bulkTranslationProgress.total > 0 ? Math.min(100, Math.round((bulkTranslationProgress.completed / bulkTranslationProgress.total) * 100)) : 0}%`,
                      backgroundColor: settings?.primaryColor || '#865d39',
                    }}
                  />
                </div>
              </div>
            )}
            
            <form onSubmit={handleAddCategory} className="bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-black/10 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text" 
                  placeholder="Nome da categoria (Ex: Pratos Executivos)"
                  className="flex-grow p-3 rounded-xl border border-gray-300 w-full bg-white text-black"
                  value={newCategory.title || ''}
                  onChange={e => setNewCategory({...newCategory, title: e.target.value})}
                />
                <button
                  type="button"
                  disabled={isTranslatingCategory || !newCategory.title?.trim()}
                  onClick={handleAutoTranslateCategory}
                  className="px-4 py-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isTranslatingCategory ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {isTranslatingCategory ? 'Traduzindo...' : '✨ Traduzir Automaticamente para EN / ES / PT'}
                </button>
              </div>

              {/* Traduções da Categoria (EN / ES / PT) */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                    <Globe size={14} /> Traduções do Cardápio (Inglês / Espanhol / Português)
                  </span>
                  <span className="text-[10px] font-semibold text-stone-500">
                    Preenchidas automaticamente ao salvar se ficarem em branco
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-stone-600">Inglês (EN)</label>
                    <input
                      type="text"
                      className="w-full p-2.5 rounded-lg border border-gray-300 bg-white text-xs text-black"
                      placeholder="Ex: Gourmet Truffles"
                      value={newCategory.title_en || ''}
                      onChange={e => setNewCategory({ ...newCategory, title_en: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-stone-600">Espanhol (ES)</label>
                    <input
                      type="text"
                      className="w-full p-2.5 rounded-lg border border-gray-300 bg-white text-xs text-black"
                      placeholder="Ex: Trufas Gourmet"
                      value={newCategory.title_es || ''}
                      onChange={e => setNewCategory({ ...newCategory, title_es: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-stone-600">Português (PT)</label>
                    <input
                      type="text"
                      className="w-full p-2.5 rounded-lg border border-gray-300 bg-white text-xs text-black"
                      placeholder="Ex: Brigadeiros Gourmet"
                      value={newCategory.title_pt || ''}
                      onChange={e => setNewCategory({ ...newCategory, title_pt: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button 
                  type="submit"
                  className="px-6 py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  style={{ 
                    backgroundColor: settings?.primaryColor || '#865d39',
                    color: getContrastText(settings?.primaryColor || '#865d39')
                  }}
                >
                  {isEditingCategory ? <Save size={20} /> : <Plus size={20} />}
                  {isEditingCategory ? 'Salvar' : 'Adicionar'}
                </button>
                {isEditingCategory && (
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditingCategory(null);
                      setNewCategory({ title: '', title_en: '', title_es: '', title_pt: '', order: 0, catalog: 'both' });
                    }}
                    className="px-6 py-3 rounded-xl bg-gray-200 font-bold cursor-pointer text-black hover:bg-gray-300 transition-colors"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            <div className="space-y-3">
              {categories.map((cat, idx) => (
                <motion.div 
                  layout
                  key={cat.id} 
                  className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-black/10 flex items-center justify-between group hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <button 
                        onClick={() => moveCategory(cat.id, 'up')}
                        disabled={idx === 0}
                        className="p-1 hover:bg-black/5 rounded disabled:opacity-20 cursor-pointer transition-colors"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button 
                        onClick={() => moveCategory(cat.id, 'down')}
                        disabled={idx === categories.length - 1}
                        className="p-1 hover:bg-black/5 rounded disabled:opacity-20 cursor-pointer transition-colors"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        <span className="font-bold text-lg text-black">{cat.title}</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-black/5 text-gray-600 border border-black/5 w-max">
                          {products.filter(p => p.categoryId === cat.id).length} {products.filter(p => p.categoryId === cat.id).length === 1 ? 'prato' : 'pratos'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                        <span className={`px-1.5 py-0.5 rounded ${cat.title_en ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400'}`}>
                          EN{cat.title_en ? `: ${cat.title_en}` : ' pendente'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded ${cat.title_es ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400'}`}>
                          ES{cat.title_es ? `: ${cat.title_es}` : ' pendente'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded ${cat.title_pt ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400'}`}>
                          PT{cat.title_pt ? `: ${cat.title_pt}` : ' pendente'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button 
                      onClick={() => {
                        setIsEditingCategory(cat);
                        setNewCategory({
                          title: cat.title,
                          title_en: cat.title_en || cat.translations?.en?.title || '',
                          title_es: cat.title_es || cat.translations?.es?.title || '',
                          title_pt: cat.title_pt || cat.translations?.pt?.title || '',
                          order: cat.order || 0,
                          catalog: (cat.catalog || 'both') as any
                        });
                        scrollToTop();
                      }}
                      className="p-2 text-amber-900 hover:bg-amber-50 bg-white shadow-sm border border-amber-200/80 rounded-xl cursor-pointer transition-all hover:scale-105 active:scale-95"
                      title="Editar Categoria"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => deleteCategory(cat.id)}
                      className="p-2 text-red-600 hover:bg-red-50 bg-white shadow-sm border border-black/5 rounded-xl cursor-pointer transition-all hover:scale-105 active:scale-95"
                      title="Excluir Categoria"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'menu' && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-3xl font-serif font-bold">Gerenciar Cardápio</h2>
              <button
                type="button"
                disabled={isBulkTranslating}
                onClick={handleBulkTranslateCatalog}
                className="px-5 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-60"
              >
                {isBulkTranslating ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                {isBulkTranslating
                  ? 'Traduzindo Cardápio...'
                  : `🌐 Traduzir Todos os Produtos e Categorias Pendentes (${countPendingCatalogTranslations(categories, products, sides)})`}
              </button>
            </div>

            {bulkTranslationProgress && (
              <div className="bg-white/95 backdrop-blur-md p-5 rounded-2xl border border-amber-200 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between gap-3 text-xs font-bold text-stone-900">
                  <span className="flex items-center gap-2 truncate">
                    <Loader2 size={14} className={isBulkTranslating ? 'animate-spin text-amber-700' : 'text-emerald-600'} />
                    {bulkTranslationProgress.currentLabel}
                  </span>
                  <span className="shrink-0 font-black tabular-nums">
                    {bulkTranslationProgress.completed} / {bulkTranslationProgress.total} (
                    {bulkTranslationProgress.total > 0
                      ? Math.min(100, Math.round((bulkTranslationProgress.completed / bulkTranslationProgress.total) * 100))
                      : 0}
                    %)
                  </span>
                </div>
                <div className="w-full h-3 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${bulkTranslationProgress.total > 0 ? Math.min(100, Math.round((bulkTranslationProgress.completed / bulkTranslationProgress.total) * 100)) : 0}%`,
                      backgroundColor: settings?.primaryColor || '#865d39',
                    }}
                  />
                </div>
              </div>
            )}

            <form onSubmit={handleAddProduct} className="glass p-8 rounded-2xl space-y-6 text-black">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-xl font-serif font-bold text-gray-900">{isEditingProduct ? 'Editar Produto' : 'Novo Produto'}</h3>
                <button
                  type="button"
                  disabled={isTranslatingProduct || !newProduct.title?.trim()}
                  onClick={handleAutoTranslateProduct}
                  className="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isTranslatingProduct ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {isTranslatingProduct ? 'Traduzindo...' : '✨ Traduzir Automaticamente para EN / ES / PT'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase text-gray-700 opacity-90">Título do Produto</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white"
                      value={newProduct.title || ''}
                      onChange={e => setNewProduct({...newProduct, title: e.target.value})}
                      placeholder="Ex: Prato Executivo de Frango"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase text-gray-700 opacity-90">Descrição</label>
                    <textarea 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white"
                      rows={3}
                      value={newProduct.description}
                      onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                      placeholder="Detalhes do produto..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase text-gray-700 opacity-90">Ingredientes / Alérgicos (opcional)</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-sm"
                      value={newProduct.ingredients || ''}
                      onChange={e => setNewProduct({...newProduct, ingredients: e.target.value})}
                      placeholder="Ex: Leite condensado, cacau, contém lactose e glúten"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase text-gray-700 opacity-90">Preço Original (De) ({currencySymbol})</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold opacity-50 text-gray-600">{currencySymbol}</span>
                        <input 
                          type="text" 
                          className="w-full p-3 pl-10 rounded-xl border border-gray-300 bg-white"
                          value={oldPriceInput}
                          onChange={e => handleOldPriceChange(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase text-gray-700 opacity-90">Preço Promocional (Por) ({currencySymbol})</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold opacity-50 text-gray-600">{currencySymbol}</span>
                        <input 
                          type="text" 
                          className="w-full p-3 pl-10 rounded-xl border border-gray-300 bg-white"
                          value={priceInput}
                          onChange={e => handlePriceChange(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase text-gray-700 opacity-90">Categoria</label>
                    {categories.length === 0 ? (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 text-black">
                        <p className="text-xs text-red-700 font-bold leading-relaxed">
                          ⚠️ Nenhuma categoria cadastrada. Crie uma abaixo para poder cadastrar produtos:
                        </p>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="Ex: Hambúrgueres, Bebidas..." 
                            className="flex-grow p-2 text-xs rounded-lg border border-red-300 bg-white text-black"
                            id="quick-category-input"
                          />
                          <button 
                            type="button" 
                            onClick={async () => {
                              const input = document.getElementById('quick-category-input') as HTMLInputElement;
                              if (!input || !input.value.trim()) {
                                toast.error('Digite o nome da categoria.');
                                return;
                              }
                              const title = input.value.trim();
                              try {
                                await addDoc(collection(db, 'categorias'), {
                                  title,
                                  order: 0,
                                  catalog: 'both'
                                });
                                toast.success('Categoria adicionada com sucesso!');
                              } catch (err) {
                                toast.error('Erro ao adicionar categoria.');
                              }
                            }}
                            className="px-3 py-2 bg-[#865d39] text-white text-xs font-bold rounded-lg hover:brightness-110 transition-all flex items-center gap-1"
                          >
                            <Plus size={12} /> Criar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <select 
                        className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black font-sans"
                        value={newProduct.categoryId}
                        onChange={e => setNewProduct({...newProduct, categoryId: e.target.value})}
                      >
                        <option value="">Selecionar categoria...</option>
                        {[...categories]
                          .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR', { sensitivity: 'base' }))
                          .map(cat => {
                            const showCatalogName = !!settings?.selectorEnabled;
                            const catName = cat.catalog === 'catalog1' 
                              ? (settings?.catalog1Title || 'Catálogo 1') 
                              : cat.catalog === 'catalog2' 
                                ? (settings?.catalog2Title || 'Catálogo 2') 
                                : cat.catalog === 'catalog3'
                                  ? (settings?.catalog3Title || 'Catálogo 3')
                                  : cat.catalog === 'catalog4'
                                    ? (settings?.catalog4Title || 'Catálogo 4')
                                    : cat.catalog === 'all'
                                    ? 'Todos os Cardápios'
                                    : 'Ambos os Cardápios';
                            return (
                              <option key={cat.id} value={cat.id}>
                                {cat.title}{showCatalogName ? ` — (${catName})` : ''}
                              </option>
                            );
                          })}
                      </select>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase text-gray-700 opacity-90">Imagem do Produto</label>
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-24 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shadow-sm">
                        {newProduct.image ? (
                          <img src={newProduct.image} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <ImageIcon className="text-gray-300" size={32} />
                        )}
                      </div>
                      <input 
                        type="file" 
                        id="product-image"
                        accept="image/*"
                        onChange={e => handleFileChange(e, (b64) => setNewProduct({...newProduct, image: b64}))}
                        className="hidden"
                      />
                      <label 
                        htmlFor="product-image"
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold cursor-pointer hover:bg-gray-50 transition-colors text-black font-sans"
                      >
                        Selecionar Imagem
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 p-4 bg-white/50 rounded-2xl border border-gray-100">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 rounded border-gray-300"
                        checked={!!newProduct.hasSizes}
                        onChange={e => {
                          const checked = e.target.checked;
                          setNewProduct({
                            ...newProduct,
                            hasSizes: checked,
                            sizes: newProduct.sizes || []
                          });
                        }}
                      />
                      <span className="font-bold text-sm text-gray-800">Habilitar Múltiplos Tamanhos, Quantidades ou Preços (Variações)</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/70">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 rounded border-gray-300 accent-amber-600"
                        checked={!!newProduct.is3D}
                        onChange={e => setNewProduct({ ...newProduct, is3D: e.target.checked })}
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-amber-950 flex items-center gap-1.5">
                          <span>✨ Ativar Efeito 3D Interativo (Tridimensional)</span>
                        </span>
                        <span className="text-[11px] text-amber-800/80">
                          Exibe o prato flutuando livremente no cardápio com rotação 360°, física de sombra real e interação por toque.
                        </span>
                      </div>
                    </label>

                    {newProduct.hasSizes && (
                      <div className="space-y-4 pl-8 mt-2 text-black">
                        <div className="bg-white/40 p-4 rounded-xl border border-gray-200 space-y-3">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-900 opacity-95">Adicionar Tamanho/Preço</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold uppercase text-gray-700 opacity-90">Nome da Opção</label>
                              <input 
                                type="text"
                                placeholder="Ex: Pequeno / 10 Pessoas"
                                className="w-full p-2 text-xs rounded-lg border border-gray-300 bg-white text-black font-sans"
                                value={sizeForm.name}
                                onChange={e => setSizeForm({ ...sizeForm, name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold uppercase text-gray-700 opacity-90">Preço ({currencySymbol})</label>
                              <input 
                                type="text"
                                placeholder="0,00"
                                className="w-full p-2 text-xs rounded-lg border border-gray-300 bg-white text-black font-sans"
                                value={sizeForm.price}
                                onChange={e => {
                                  const digits = e.target.value.replace(/\D/g, '');
                                  if (!digits) {
                                    setSizeForm({ ...sizeForm, price: '' });
                                    return;
                                  }
                                  const val = parseInt(digits) / 100;
                                  setSizeForm({ ...sizeForm, price: val.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) });
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleAddSizeOption}
                              className="flex-grow py-2 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm active:scale-98"
                              style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                            >
                              {editingSizeId ? (
                                <>
                                  <Save size={14} /> Salvar Alterações
                                </>
                              ) : (
                                <>
                                  <Plus size={14} /> Adicionar Opção de Tamanho
                                </>
                              )}
                            </button>
                            {editingSizeId && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSizeId(null);
                                  setSizeForm({ name: '', price: '', oldPrice: '' });
                                }}
                                className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </div>

                        {/* List of defined sizes */}
                        <div className="space-y-2">
                          {(newProduct.sizes || []).map((size, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3.5 bg-white/60 rounded-xl border border-gray-200">
                              <div>
                                <span className="font-bold text-xs text-black block">{size.name}</span>
                                <span className="text-[10px] text-gray-700 font-mono">
                                  Preço: {size.price && size.price > 0 ? `${currencySymbol} ${size.price.toFixed(2).replace('.', ',')}` : 'Sob Consulta (Sem valor)'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSizeId(size.id);
                                    setSizeForm({
                                      name: size.name,
                                      price: (size.price && size.price > 0) ? size.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
                                      oldPrice: ''
                                    });
                                  }}
                                  className="p-1.5 text-amber-900 hover:bg-amber-50 hover:text-amber-950 rounded-lg transition-colors cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editingSizeId === size.id) {
                                      setEditingSizeId(null);
                                      setSizeForm({ name: '', price: '', oldPrice: '' });
                                    }
                                    setNewProduct({
                                      ...newProduct,
                                      sizes: (newProduct.sizes || []).filter((_, sIdx) => sIdx !== idx)
                                    });
                                  }}
                                  className="p-1.5 text-red-600 hover:bg-red-50 hover:text-red-800 rounded-lg transition-colors cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {(newProduct.sizes || []).length === 0 && (
                            <div className="text-center p-4 bg-gray-50/20 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500">
                              Nenhum tamanho adicionado ainda. É necessário adicionar pelo menos 1 tamanho.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Seção de Traduções do Cardápio (Inglês / Espanhol / Português) */}
              <div className="p-5 rounded-2xl bg-white/80 border border-stone-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                      <Globe size={15} /> Traduções do Cardápio (Inglês / Espanhol / Português)
                    </h4>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Salvas direto no banco de dados para troca instantânea (0ms) no totem do cliente. Campos vazios são preenchidos automaticamente ao salvar.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200 self-start sm:self-auto">
                    {([
                      { id: 'en', label: 'Inglês (EN)', filled: Boolean(newProduct.title_en?.trim()) },
                      { id: 'es', label: 'Espanhol (ES)', filled: Boolean(newProduct.title_es?.trim()) },
                      { id: 'pt', label: 'Português (PT)', filled: Boolean(newProduct.title_pt?.trim()) },
                    ] as const).map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setProductTranslationTab(tab.id)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                          productTranslationTab === tab.id
                            ? 'bg-stone-900 text-white shadow-sm'
                            : 'text-stone-700 hover:bg-white'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {tab.filled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                {productTranslationTab === 'en' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-stone-600">Título em Inglês (EN)</label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        placeholder="Ex: Açaí Bowl"
                        value={newProduct.title_en || ''}
                        onChange={e => setNewProduct({ ...newProduct, title_en: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-stone-600">Ingredientes / Alérgicos em Inglês (EN)</label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        placeholder="Ex: Organic açaí, banana, strawberry, granola"
                        value={newProduct.ingredients_en || ''}
                        onChange={e => setNewProduct({ ...newProduct, ingredients_en: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-stone-600">Descrição em Inglês (EN)</label>
                      <textarea
                        rows={2}
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        placeholder="Descrição traduzida para inglês..."
                        value={newProduct.description_en || ''}
                        onChange={e => setNewProduct({ ...newProduct, description_en: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {productTranslationTab === 'es' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-stone-600">Título em Espanhol (ES)</label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        placeholder="Ex: Bowl de Açaí"
                        value={newProduct.title_es || ''}
                        onChange={e => setNewProduct({ ...newProduct, title_es: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-stone-600">Ingredientes / Alérgicos em Espanhol (ES)</label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        placeholder="Ex: Açaí orgánico, plátano, fresa, granola"
                        value={newProduct.ingredients_es || ''}
                        onChange={e => setNewProduct({ ...newProduct, ingredients_es: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-stone-600">Descrição em Espanhol (ES)</label>
                      <textarea
                        rows={2}
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        placeholder="Descrição traduzida para espanhol..."
                        value={newProduct.description_es || ''}
                        onChange={e => setNewProduct({ ...newProduct, description_es: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {productTranslationTab === 'pt' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-stone-600">Título em Português (PT)</label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        placeholder="Ex: Açaí na Tigela"
                        value={newProduct.title_pt || ''}
                        onChange={e => setNewProduct({ ...newProduct, title_pt: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-stone-600">Ingredientes / Alérgicos em Português (PT)</label>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        placeholder="Ex: Açaí, banana, morango e granola"
                        value={newProduct.ingredients_pt || ''}
                        onChange={e => setNewProduct({ ...newProduct, ingredients_pt: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[11px] font-bold uppercase text-stone-600">Descrição em Português (PT)</label>
                      <textarea
                        rows={2}
                        className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        placeholder="Descrição em português..."
                        value={newProduct.description_pt || ''}
                        onChange={e => setNewProduct({ ...newProduct, description_pt: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  style={{ 
                    backgroundColor: settings?.primaryColor || '#865d39',
                    color: getContrastText(settings?.primaryColor || '#865d39')
                  }}
                >
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : (isEditingProduct ? <Save size={20} /> : <Plus size={20} />)}
                  {isSaving ? 'Salvando...' : (isEditingProduct ? 'Salvar Alterações' : 'Adicionar ao Cardápio')}
                </button>
                {isEditingProduct && (
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditingProduct(null);
                      setNewProduct({ 
                        title: '', description: '', title_en: '', title_es: '', title_pt: '',
                        description_en: '', description_es: '', description_pt: '',
                        ingredients_en: '', ingredients_es: '', ingredients_pt: '',
                        price: 0, oldPrice: 0, priceType: 'fixed',
                        image: '', categoryId: '', isMeal: true, isCustomCake: false, isCustomSandwich: false, customFillings: '', ingredients: '', allowedSides: [], isActive: true,
                        hasSizes: false, sizes: [],
                        nutritionalInfo: {
                          calories: '',
                          carbs: '',
                          proteins: '',
                          totalFat: '',
                          saturatedFat: '',
                          transFat: '',
                          fiber: '',
                          sodium: ''
                        }
                      });
                      setPriceInput('');
                      setOldPriceInput('');
                      setEditingSizeId(null);
                      setSizeForm({ name: '', price: '', oldPrice: '' });
                    }}
                    className="w-full sm:w-auto px-8 py-3 rounded-xl bg-gray-200 font-bold text-black cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-black/10 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar produto pelo nome..."
                  className="w-full p-3 pl-10 rounded-xl border border-gray-300 bg-white text-black"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={printAllProductsList}
                className="w-full md:w-auto px-6 py-3 rounded-xl bg-gray-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Printer size={18} /> Imprimir Todos os Produtos
              </button>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="text-center p-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-sm border border-black/10">
                <p className="text-gray-500 font-bold text-black opacity-60">Nenhum produto encontrado com a pesquisa atual.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map(product => (
                  <motion.div 
                    layout
                    key={product.id} 
                    className={cn(
                      "bg-white/95 backdrop-blur-md rounded-2xl overflow-hidden flex flex-col border transition-all shadow-sm hover:shadow-md",
                      product.isActive === false ? "opacity-50 grayscale border-black/10" : "border-black/10"
                    )}
                  >
                    <div className="h-48 relative">
                      <img src={product.image} alt={product.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute top-3 right-3 flex gap-2">
                        <button 
                           onClick={() => toggleProductStatus(product)}
                          className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-sm text-gray-700 hover:text-black"
                          title={product.isActive === false ? "Ativar" : "Desativar"}
                        >
                          {product.isActive === false ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                        <button 
                          onClick={() => {
                            setIsEditingProduct(product);
                            setNewProduct({
                              title: product.title,
                              description: product.description,
                              title_en: product.title_en || product.translations?.en?.title || '',
                              title_es: product.title_es || product.translations?.es?.title || '',
                              title_pt: product.title_pt || product.translations?.pt?.title || '',
                              description_en: product.description_en || product.translations?.en?.description || '',
                              description_es: product.description_es || product.translations?.es?.description || '',
                              description_pt: product.description_pt || product.translations?.pt?.description || '',
                              ingredients_en: product.ingredients_en || '',
                              ingredients_es: product.ingredients_es || '',
                              ingredients_pt: product.ingredients_pt || '',
                              price: product.price,
                              oldPrice: product.oldPrice || 0,
                              priceType: product.priceType || 'fixed',
                              image: product.image,
                              categoryId: product.categoryId,
                              isMeal: product.isMeal || false,
                              isCustomCake: product.isCustomCake || false,
                              isCustomSandwich: product.isCustomSandwich || false,
                              is3D: product.is3D || false,
                              customFillings: product.customFillings || '',
                              ingredients: product.ingredients || '',
                              allowedSides: product.allowedSides || [],
                              isActive: product.isActive ?? true,
                              hasSizes: product.hasSizes || false,
                              sizes: product.sizes || [],
                              cakeGalleryId: product.cakeGalleryId || '',
                              nutritionalInfo: product.nutritionalInfo || {
                                calories: '',
                                carbs: '',
                                proteins: '',
                                totalFat: '',
                                saturatedFat: '',
                                transFat: '',
                                fiber: '',
                                sodium: ''
                              }
                            });
                            setPriceInput(product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                            setEditingSizeId(null);
                            setSizeForm({ name: '', price: '', oldPrice: '' });
                            setOldPriceInput(product.oldPrice ? product.oldPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
                            scrollToTop();
                          }}
                          className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-sm text-blue-600"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => deleteProduct(product.id)}
                          className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-sm text-red-600"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      {/* Indicador de traduções EN / ES / PT */}
                      <div className="absolute bottom-2 left-2 flex items-center gap-1">
                        {(['en', 'es', 'pt'] as const).map(code => {
                          const ok = Boolean(
                            code === 'en'
                              ? product.title_en || product.translations?.en?.title
                              : code === 'es'
                              ? product.title_es || product.translations?.es?.title
                              : product.title_pt || product.translations?.pt?.title
                          );
                          return (
                            <span
                              key={code}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase shadow-xs ${
                                ok ? 'bg-emerald-600 text-white' : 'bg-white/85 text-gray-400'
                              }`}
                            >
                              {code}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="p-5 flex-grow flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <h4 className="font-serif font-bold text-lg">{product.title}</h4>
                        <div className="flex flex-col items-end">
                          {product.sizes && product.sizes.length > 0 ? (
                            <>
                              <span className="text-[10px] font-bold uppercase opacity-40">Tamanhos múltiplos</span>
                              <span className="font-bold text-blue-600">
                                A partir de: {currencySymbol} {Math.min(...product.sizes.map(s => s.price)).toFixed(2).replace('.', ',')}
                              </span>
                            </>
                          ) : (
                            <>
                              {product.price > 0 && product.oldPrice && product.oldPrice > 0 && (
                                <span className="text-xs line-through opacity-40">
                                  {currencySymbol} {product.oldPrice.toFixed(2).replace('.', ',')}
                                </span>
                              )}
                              <span className="font-bold text-blue-600">
                                {currencySymbol} {(product.price > 0 ? product.price : (product.oldPrice || 0)).toFixed(2).replace('.', ',')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-sm opacity-60 line-clamp-2">{product.description}</p>
                      
                      {product.sizes && product.sizes.length > 0 && (
                        <div className="bg-black/5 p-2 rounded-xl text-[11px] space-y-1 mt-2">
                          <span className="font-bold opacity-60">Tamanhos:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {product.sizes.map((s, idx) => (
                              <span key={idx} className="bg-white/70 px-2 py-0.5 rounded border border-black/5 font-medium text-black">
                                {s.name} ({currencySymbol} {s.price.toFixed(2).replace('.', ',')})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="mt-auto pt-3 flex items-center justify-between border-t border-black/5">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">
                          {categories.find(c => c.id === product.categoryId)?.title || 'Sem categoria'}
                        </span>
                        <div className="flex gap-1.5">
                          {product.isMeal && (
                            <span className="px-2 py-1 bg-green-50 text-green-600 text-[10px] font-bold rounded-full uppercase">
                              Opções de Personalização
                            </span>
                          )}
                          {product.sizes && product.sizes.length > 0 && (
                            <span className="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full uppercase">
                              Múltiplos Tamanhos
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sortMenu' && (
          <SortMenuAdmin 
            categories={categories}
            products={products}
            settings={settings}
            onGoToProducts={() => setActiveTab('menu')}
            onEditProduct={(prod) => {
              setIsEditingProduct(prod);
              setActiveTab('menu');
            }}
          />
        )}

        {activeTab === 'orders' && (
          <div className="space-y-8">
            {/* Dynamic Orders Calendar */}
            <OrdersCalendar 
              orders={orders} 
              settings={settings}
              products={products}
              onSelectOrderInList={(orderId) => {
                const el = document.getElementById(`order-${orderId}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('ring-4', 'ring-blue-400');
                  setTimeout(() => el.classList.remove('ring-4', 'ring-blue-400'), 2500);
                } else {
                  setStartDate('');
                  setEndDate('');
                  setOrderSearch('');
                  setSelectedHistoryCatalog('all');
                  setFilterValidatedOnly(false);
                  setShowBatchSummary(false);
                  setTimeout(() => {
                    const target = document.getElementById(`order-${orderId}`);
                    if (target) {
                      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      target.classList.add('ring-4', 'ring-blue-400');
                      setTimeout(() => target.classList.remove('ring-4', 'ring-blue-400'), 2500);
                    }
                  }, 150);
                }
              }}
              onPrintOrder={(ord) => printOrder(ord)}
              onEditOrder={(ord) => {
                setIsEditingOrder(ord);
                setEditOrderForm({ ...ord, phone: formatPhoneByCountry(ord.phone || '', settings?.whatsappCountryCode || '+55') });
              }}
            />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-3xl font-serif font-bold">Histórico de Pedidos</h2>
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => {
                    setManualOrderForm({
                      customerName: '',
                      phone: '',
                      email: '',
                      address: '',
                      street: '',
                      number: '',
                      zipCode: '',
                      city: '',
                      pickupDate: '',
                      observation: '',
                      birthday: ''
                    });
                    setManualOrderItems([]);
                    setOrderCustomerSearch('');
                    setIsAddingOrder(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white bg-green-600 hover:bg-green-700 shadow-md transition-all cursor-pointer"
                >
                  <Plus size={18} /> Adicionar Pedido
                </button>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input 
                    type="text" 
                    placeholder="MM/DD/AAAA"
                    className="pl-10 p-2 rounded-xl border border-gray-300 bg-white text-black font-semibold text-sm w-36 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#865d39]"
                    value={startDate}
                    onChange={e => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (val.length > 8) val = val.slice(0, 8);
                      if (val.length > 4) val = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4);
                      else if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                      setStartDate(val);
                    }}
                  />
                </div>
                <span className="text-gray-800 font-bold">até</span>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input 
                    type="text" 
                    placeholder="MM/DD/AAAA"
                    className="pl-10 p-2 rounded-xl border border-gray-300 bg-white text-black font-semibold text-sm w-36 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#865d39]"
                    value={endDate}
                    onChange={e => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (val.length > 8) val = val.slice(0, 8);
                      if (val.length > 4) val = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4);
                      else if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                      setEndDate(val);
                    }}
                  />
                </div>
                <button 
                  onClick={() => {
                    setShowBatchSummary(false);
                    setStartDate('');
                    setEndDate('');
                    setSelectedHistoryCatalog('all');
                    setFilterValidatedOnly(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer",
                    (selectedHistoryCatalog === 'all' && !startDate && !endDate && !showBatchSummary && !filterValidatedOnly) 
                      ? "bg-gray-800 text-white shadow-md" 
                      : "bg-white border border-gray-300 text-gray-600"
                  )}
                >
                  <History size={18} /> Todos os Pedidos
                </button>
                <button 
                  onClick={() => {
                    setShowBatchSummary(false);
                    setFilterValidatedOnly(!filterValidatedOnly);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer",
                    filterValidatedOnly 
                      ? "bg-amber-900 text-white shadow-md font-extrabold ring-2 ring-amber-300" 
                      : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <CheckCircle2 size={18} className={filterValidatedOnly ? "text-white" : "text-amber-800"} /> Pedidos Validados
                </button>

                <button 
                  onClick={() => {
                    if (!startDate || !endDate) {
                      toast.error('Por favor, selecione um intervalo de datas primeiro.');
                      return;
                    }
                    setShowBatchSummary(!showBatchSummary);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer",
                    showBatchSummary ? "bg-amber-900 text-white shadow-md font-extrabold" : "bg-white border border-gray-300 text-gray-600"
                  )}
                >
                  <Layers size={18} /> Resumo de Produção
                </button>
                {showBatchSummary ? (
                  <button 
                    onClick={printProductionSummary}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white transition-all shadow-md cursor-pointer hover:brightness-110"
                    style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                  >
                    <Printer size={18} /> Imprimir Resumo
                  </button>
                ) : (
                  <button 
                    onClick={printOrdersList}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white transition-all shadow-md cursor-pointer hover:brightness-110"
                    style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                  >
                    <Printer size={18} /> Imprimir Lista
                  </button>
                )}
              </div>
            </div>

            <div className="glass p-4 rounded-2xl flex flex-col gap-2">
              <input 
                type="text" 
                placeholder="Buscar por nome do cliente, telefone ou ID..."
                className="w-full p-3 rounded-xl border border-gray-300 bg-white"
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
              />
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="font-bold text-gray-600">
                  Exibindo {filteredOrders.length} {filteredOrders.length === 1 ? 'pedido' : 'pedidos'} no histórico
                </span>
                {orders.length > 0 && filteredOrders.length !== orders.length && (
                  <button
                    onClick={() => {
                      setOrderSearch('');
                      setStartDate('');
                      setEndDate('');
                      setFilterValidatedOnly(false);
                      setSelectedHistoryCatalog('all');
                    }}
                    className="text-amber-900 font-bold hover:underline cursor-pointer"
                  >
                    Limpar filtros ({orders.length} pedidos no total)
                  </button>
                )}
              </div>
            </div>

            {showBatchSummary ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-white/95 backdrop-blur-md p-6 rounded-2xl space-y-4 shadow-sm border border-black/10">
                  <h3 className="text-xl font-serif font-bold flex items-center gap-2">
                    <Package size={20} className="text-amber-900" />
                    Total de Itens
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(batchSummary.items).length > 0 ? (
                      Object.entries(batchSummary.items).map(([title, qty]) => (
                        <div key={title} className="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                          <span className="font-bold">{title}</span>
                          <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-full font-bold">{qty}x</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-gray-500 py-4">Nenhum item no período</p>
                    )}
                  </div>
                </div>

                <div className="bg-white/95 backdrop-blur-md p-6 rounded-2xl space-y-4 shadow-sm border border-black/10">
                  <h3 className="text-xl font-serif font-bold flex items-center gap-2">
                    <Plus size={20} className="text-amber-800" />
                    Total de Acompanhamentos
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(batchSummary.sides).length > 0 ? (
                      Object.entries(batchSummary.sides).map(([name, qty]) => (
                        <div key={name} className="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                          <span className="font-bold">{name}</span>
                          <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-full font-bold">{qty}x</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-gray-500 py-4">Nenhum acompanhamento no período</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map(order => (
                <motion.div 
                  layout
                  key={order.id} 
                  id={`order-${order.id}`}
                  className="bg-white/95 backdrop-blur-md p-6 rounded-2xl space-y-4 border border-black/10 shadow-sm hover:shadow-md"
                >
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {order.orderNumber !== undefined && (
                          <span
                            className="px-3 py-1 rounded-xl text-sm font-black tracking-tight shadow-sm"
                            style={{
                              backgroundColor: settings?.primaryColor || '#865d39',
                              color: getContrastText(settings?.primaryColor || '#865d39'),
                            }}
                          >
                            #{order.orderNumber}
                          </span>
                        )}
                        <h3 className="text-xl font-serif font-bold text-black">
                          {order.isB2B || order.isPJ 
                            ? (order.b2bCompanyName || order.customerName)
                            : order.customerName
                          }
                        </h3>
                        {order.orderType && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-stone-900 text-white text-[11px] font-black uppercase tracking-wider">
                            {order.orderType === 'dine_in' ? 'DINE-IN' : 'TAKEOUT'}
                            {order.tableOrPager ? ` • #${order.tableOrPager}` : ''}
                          </span>
                        )}
                        {order.paymentStatus === 'paid' && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-black uppercase tracking-wider">
                            PAID (TERMINAL)
                          </span>
                        )}
                        {(order.isB2B || order.isPJ) && (
                          <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-black rounded-full flex items-center gap-1 border border-amber-200 uppercase tracking-widest animate-pulse">
                            ★ Corporate PJ
                          </span>
                        )}
                        {isBirthdayThisWeek(order.birthday, order.orderLanguage) && (
                          <span className="px-3 py-1 bg-pink-100 text-pink-600 text-xs font-bold rounded-full flex items-center gap-1">
                            <Cake size={12} /> Aniversariante! ({order.birthday})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-700 font-medium">
                        {order.phone && (
                          <a 
                            href={`https://wa.me/${getCleanWhatsAppPhone(order.phone)}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-green-600 transition-colors font-bold text-black"
                          >
                            <MessageCircle size={14} className="text-green-600" /> {order.phone}
                          </a>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar size={14} /> Criado em: {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-US') : (order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleString('en-US') : (order.createdAt ? new Date(order.createdAt as any).toLocaleString('en-US') : 'N/A'))}
                        </span>
                        {order.pickupDate && (
                          <span 
                            className="flex items-center gap-1.5 font-black px-3 py-1 rounded-xl shadow-sm text-xs"
                            style={{ 
                              backgroundColor: settings?.primaryColor || '#865d39',
                              color: getContrastText(settings?.primaryColor || '#865d39')
                            }}
                          >
                            🚚 Agendado para: {order.pickupDate}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                        <span className="text-xs font-bold text-gray-500 mr-1 uppercase">Sinalizar Pagamento:</span>
                        <button
                          onClick={() => updateOrderPaymentStatus(order.id, 'pending')}
                          className={cn(
                            "px-2.5 py-1 text-xs font-bold rounded-lg transition-all border cursor-pointer",
                            (!order.paymentStatus || order.paymentStatus === 'pending')
                              ? "bg-red-50 text-red-700 border-red-300 shadow-sm"
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          ❌ Não Recebido
                        </button>
                        <button
                          onClick={() => updateOrderPaymentStatus(order.id, 'half')}
                          className={cn(
                            "px-2.5 py-1 text-xs font-bold rounded-lg transition-all border flex items-center gap-1 cursor-pointer",
                            order.paymentStatus === 'half'
                              ? "bg-amber-100 text-amber-800 border-amber-400 shadow-sm font-extrabold ring-2 ring-amber-200"
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          ⏳ 50% Recebido
                        </button>
                        <button
                          onClick={() => updateOrderPaymentStatus(order.id, 'paid')}
                          className={cn(
                            "px-2.5 py-1 text-xs font-bold rounded-lg transition-all border flex items-center gap-1 cursor-pointer",
                            (order.paymentStatus === 'full' || order.paymentStatus === 'paid')
                              ? "bg-emerald-100 text-emerald-900 border-emerald-400 shadow-sm font-extrabold ring-2 ring-emerald-200"
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          ✅ Pago / Integral
                        </button>
                        {(order.paymentStatus === 'half' || order.paymentStatus === 'full' || order.paymentStatus === 'paid') && (
                          <span 
                            className="ml-1 px-2.5 py-1 text-xs font-black text-white rounded-lg uppercase tracking-wider shadow-md"
                            style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                          >
                            🚀 Validado para Produção
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        {order.phone && (
                          <button 
                            onClick={() => sendOrderToWhatsApp(order, settings)}
                            className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm transition-all cursor-pointer hover:bg-gray-50"
                            style={{ color: settings?.primaryColor || '#865d39' }}
                            title="Reenviar Resumo do Pedido pelo WhatsApp"
                          >
                            <MessageCircle size={20} />
                          </button>
                        )}
                        <button 
                          onClick={async () => {
                            const res = await printDualOrderReceipts(order, settings);
                            if (res.mode === 'qz-tray') {
                              toast.success('Dupla impressão 80mm enviada via QZ Tray!');
                            } else {
                              triggerBrowserIframePrint([res.customerHtml, res.kitchenHtml]);
                            }
                          }}
                          className="p-3 bg-white border border-gray-200 rounded-xl text-stone-800 hover:bg-stone-50 shadow-sm cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                          title="Imprimir Duas Vias 80mm (Cliente + Cozinha)"
                        >
                          <Printer size={18} />
                          <span className="hidden sm:inline">80mm x2</span>
                        </button>
                        <button 
                          onClick={() => {
                            setIsEditingOrder(order);
                            setEditOrderForm({ ...order, phone: formatPhoneByCountry(order.phone || '', settings?.whatsappCountryCode || '+1') });
                          }}
                          className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm cursor-pointer hover:bg-gray-50"
                          style={{ color: settings?.primaryColor || '#865d39' }}
                          title="Editar Pedido"
                        >
                          <Edit2 size={20} />
                        </button>
                        <button 
                          onClick={() => deleteOrder(order.id)}
                          className="p-3 bg-white border border-gray-200 rounded-xl text-red-600 hover:bg-red-50 shadow-sm"
                        >
                          <Trash2 size={20} />
                        </button>
                        <button 
                          onClick={() => toggleOrder(order.id)}
                          className="p-3 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 shadow-sm transition-all"
                          title={expandedOrders.includes(order.id) ? "Recolher" : "Expandir"}
                        >
                          {expandedOrders.includes(order.id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase opacity-40">
                          Total do Pedido
                        </div>
                        <div className="text-xl font-extrabold" style={{ color: settings?.primaryColor || '#865d39' }}>
                          {formatMoney(order.total, settings?.currency || 'USD')}
                        </div>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedOrders.includes(order.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-4"
                      >
                        <div className="bg-white rounded-xl p-4 space-y-3 border border-gray-200 shadow-sm">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start border-b border-black/5 last:border-0 pb-2 last:pb-0">
                              <div className="space-y-1">
                                <div className="font-bold text-black">{item.quantity}x {item.title}{item.selectedSize ? ` (${item.selectedSize.name})` : ''}</div>
                                {item.cakeOptions && (
                                  <div className="text-xs text-gray-700 space-y-0.5 font-medium">
                                    {item.cakeOptions.size && <div><span className="font-bold">Tamanho:</span> {item.cakeOptions.size}</div>}
                                    {item.cakeOptions.dough && <div><span className="font-bold">Massa:</span> {item.cakeOptions.dough}</div>}
                                    {item.cakeOptions.fillings && item.cakeOptions.fillings.length > 0 && (
                                      <div><span className="font-bold">Recheios:</span> {item.cakeOptions.fillings.join(', ')}</div>
                                    )}
                                    {item.cakeOptions.topping && <div><span className="font-bold">Cobertura:</span> {item.cakeOptions.topping}</div>}
                                    {item.cakeOptions.topper && <div><span className="font-bold">Topper:</span> {item.cakeOptions.topper}</div>}
                                  </div>
                                )}
                                {item.sandwichOptions && item.sandwichOptions.fillings && item.sandwichOptions.fillings.length > 0 && (
                                  <div className="text-xs text-gray-700 font-medium">
                                    <div><span className="font-bold">Recheios:</span> {item.sandwichOptions.fillings.join(', ')}</div>
                                  </div>
                                )}
                                {item.mealOptions && (
                                  <div className="text-xs text-gray-700 space-y-1 font-medium">
                                    {item.mealOptions.removals.length > 0 && (
                                      <div><span className="font-bold">Remover:</span> {item.mealOptions.removals.join(', ')}</div>
                                    )}
                                    {item.mealOptions.sides.length > 0 && (
                                      <div><span className="font-bold">Acompanhamentos:</span> {item.mealOptions.sides.map(s => s.name).join(', ')}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="font-bold text-black">{currencySymbol} {(item.price * item.quantity).toFixed(2).replace('.', ',')}</div>
                            </div>
                          ))}
                          
                          {order.total > 0 && !(order.isB2B || order.isPJ) && (
                            <div className="border-t border-black/10 pt-3 mt-3 space-y-1.5 text-xs text-black font-semibold">
                              {(order.taxAmount && order.taxAmount > 0) || (order.tipAmount && order.tipAmount > 0) ? (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 font-medium">Subtotal:</span>
                                    <span>{formatMoney(order.subtotal || (order.total - (order.taxAmount || 0) - (order.tipAmount || 0)), settings?.currency || 'USD')}</span>
                                  </div>
                                  {order.taxAmount !== undefined && order.taxAmount > 0 && (
                                    <div className="flex justify-between text-amber-900">
                                      <span className="text-gray-600 font-medium">Imposto Estadual ({order.taxRate ?? 7.75}%):</span>
                                      <span>+ {formatMoney(order.taxAmount, settings?.currency || 'USD')}</span>
                                    </div>
                                  )}
                                  {order.tipAmount !== undefined && order.tipAmount > 0 && (
                                    <div className="flex justify-between text-emerald-800">
                                      <span className="text-gray-600 font-medium">Tip{order.tipPercent ? ` (${order.tipPercent}%)` : ''}:</span>
                                      <span>+ {formatMoney(order.tipAmount, settings?.currency || 'USD')}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-base font-extrabold border-t border-black/5 pt-1.5" style={{ color: settings?.primaryColor || '#865d39' }}>
                                    <span>Total Paid:</span>
                                    <span>{formatMoney(order.total, settings?.currency || 'USD')}</span>
                                  </div>
                                </>
                              ) : (
                                <div className="space-y-1">
                                  {(order.deliveryFee !== undefined && order.deliveryFee > 0) ? (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600 font-medium">Subtotal dos Itens:</span>
                                        <span>{currencySymbol} {(order.subtotal || (order.total - order.deliveryFee)).toFixed(2).replace('.', ',')}</span>
                                      </div>
                                      <div className="flex justify-between text-blue-800">
                                        <span className="text-gray-600 font-medium flex items-center gap-1">
                                          <Truck size={13} /> Frete ({order.deliveryDistanceKm ? `${order.deliveryDistanceKm} km` : 'KM'}):
                                        </span>
                                        <span>+ {currencySymbol} {order.deliveryFee.toFixed(2).replace('.', ',')}</span>
                                      </div>
                                    </>
                                  ) : order.deliveryType === 'pickup' ? (
                                    <div className="flex justify-between text-green-700">
                                      <span className="text-gray-600 font-medium flex items-center gap-1">
                                        <Truck size={13} /> Retirada no Local:
                                      </span>
                                      <span>Grátis</span>
                                    </div>
                                  ) : null}
                                  <div className="flex justify-between text-base font-extrabold pt-1.5" style={{ color: settings?.primaryColor || '#865d39' }}>
                                    <span>Total:</span>
                                    <span>{currencySymbol} {order.total.toFixed(2).replace('.', ',')}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                          <div className="space-y-1">
                            <div className="font-bold uppercase text-gray-500 text-[10px] flex items-center justify-between">
                              <span>{(order.isB2B || order.isPJ) ? "Endereço Comercial / Delivery" : "Endereço de Entrega/Retirada"}</span>
                              {order.deliveryType && (
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                                  order.deliveryType === 'pickup' ? "bg-amber-100 text-amber-900" : "bg-stone-200 text-stone-900"
                                )}>
                                  {order.deliveryType === 'pickup' ? '🏪 Retirada' : '🚚 Delivery'}
                                </span>
                              )}
                            </div>
                            <div className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm font-medium text-black">
                              <div>{order.b2bAddress || order.address}</div>
                              {order.neighborhood && (
                                <div className="text-xs text-gray-600 mt-1">Bairro: <span className="font-bold text-black">{order.neighborhood}</span></div>
                              )}
                            </div>
                          </div>

                          {(order.isB2B || order.isPJ) ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <div className="font-bold uppercase text-gray-500 text-[10px]">Responsável / Contato</div>
                                  <div className="p-2.5 bg-black/5 rounded-lg border border-black/10 font-bold text-black">{order.b2bManagerName || 'N/A'}</div>
                                </div>
                                <div className="space-y-1">
                                  <div className="font-bold uppercase text-gray-500 text-[10px]">Frequência do Plano</div>
                                  <div className="p-2.5 bg-amber-500/10 text-amber-900 rounded-lg border border-amber-500/20 font-extrabold uppercase text-xs flex items-center justify-center text-center">
                                    {order.b2bFrequency === 'weekly' ? '🔄 Weekly' : '📦 One-Time'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          <div className="space-y-1 md:col-span-2">
                            <div className="font-bold uppercase text-gray-500 text-[10px]">Observações / Requisitos Especiais</div>
                            <div className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm italic text-black">
                              {order.observation || 'Nenhuma observação informada.'}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
              {filteredOrders.length === 0 && (
                <div className="glass p-12 rounded-2xl text-center text-gray-500">
                  Nenhum pedido encontrado com os filtros aplicados.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'customers' && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-3xl font-serif font-bold">Clientes</h2>
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={() => {
                  setNewCustomerForm({
                    name: '', phone: '', email: '', birthday: '', isB2B: false, managerName: '', frequency: '', address: '', street: '', number: '', zipCode: '', city: ''
                  });
                  setIsRegisteringCustomer(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white shadow-md transition-all cursor-pointer hover:brightness-110 active:scale-95"
                style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
              >
                <Plus size={18} /> Cadastrar Cliente
              </button>
              <button 
                onClick={() => {
                  setShowBirthdaysOnly(!showBirthdaysOnly);
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer",
                  showBirthdaysOnly ? "bg-pink-500 text-white shadow-md" : "bg-white border border-gray-300 text-gray-600"
                )}
              >
                <Cake size={18} /> Aniversários da Semana
              </button>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-black/10 space-y-3">
            {/* Filtro por Canal: Todos / Totem (Kiosk) / App & Online */}
            <div className="flex flex-wrap items-center gap-2">
              {([
                {
                  id: 'all',
                  label: 'Todos os Clientes',
                  count: combinedCustomers.length,
                  icon: <Users size={14} />,
                },
                {
                  id: 'kiosk',
                  label: 'Pedidos no Totem (Kiosk)',
                  count: combinedCustomers.filter(c => c.hasKioskOrders).length,
                  icon: <Monitor size={14} />,
                },
                {
                  id: 'online',
                  label: 'Pedidos pelo App / Online',
                  count: combinedCustomers.filter(c => c.hasOnlineOrders).length,
                  icon: <Smartphone size={14} />,
                },
              ] as const).map((tab) => {
                const isActive = customerChannelFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCustomerChannelFilter(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border",
                      isActive
                        ? "shadow-sm"
                        : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
                    )}
                    style={
                      isActive
                        ? {
                            backgroundColor: settings?.primaryColor || '#601a4f',
                            color: getContrastText(settings?.primaryColor || '#601a4f'),
                            borderColor: settings?.primaryColor || '#601a4f',
                          }
                        : {}
                    }
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-black tabular-nums",
                        isActive ? "bg-white/25 text-current" : "bg-white text-gray-700 border border-gray-200"
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <input 
              type="text" 
              placeholder="Buscar por nome, telefone ou e-mail..."
              className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {combinedCustomers
              .filter(c => {
                const matchesSearch = 
                  c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  c.phone.includes(customerSearch) ||
                  c.email.toLowerCase().includes(customerSearch.toLowerCase());
                
                let matchesBirthday = true;
                if (showBirthdaysOnly) {
                  matchesBirthday = isBirthdayThisWeek(c.birthday, c.orderLanguage);
                }

                const matchesChannel =
                  customerChannelFilter === 'all'
                    ? true
                    : customerChannelFilter === 'kiosk'
                      ? Boolean(c.hasKioskOrders)
                      : Boolean(c.hasOnlineOrders);
                
                return matchesSearch && matchesBirthday && matchesChannel;
              })
              .sort((a, b) => {
                const getTimestamp = (customer: any) => {
                  if (customer.lastOrder) {
                    if (customer.lastOrder.toDate) return customer.lastOrder.toDate().getTime();
                    if (customer.lastOrder instanceof Date) return customer.lastOrder.getTime();
                    const parsed = Date.parse(customer.lastOrder);
                    if (!isNaN(parsed)) return parsed;
                  }
                  if (customer.createdAt) {
                    if (customer.createdAt.toDate) return customer.createdAt.toDate().getTime();
                    if (customer.createdAt instanceof Date) return customer.createdAt.getTime();
                    const parsed = Date.parse(customer.createdAt);
                    if (!isNaN(parsed)) return parsed;
                  }
                  return 0;
                };
                const timeA = getTimestamp(a);
                const timeB = getTimestamp(b);
                return timeB - timeA;
              })
              .map((customer, idx) => {
                const isBdayUpcoming = customer.birthday && isBirthdayThisWeek(customer.birthday, customer.orderLanguage);
                return (
                  <motion.div 
                    key={customer.id || idx}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className={cn(
                      "p-6 rounded-[2rem] space-y-4 relative overflow-hidden group transition-all duration-300 bg-white border shadow-sm hover:shadow-md",
                      isBdayUpcoming 
                        ? "border-2 border-pink-400 shadow-[0_12px_30px_rgba(244,63,94,0.15)] scale-[1.01]" 
                        : "border-gray-200"
                    )}
                  >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1.5 flex-grow pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xl font-serif font-bold text-black">{customer.name}</h3>
                          </div>
                          {(customer.hasKioskOrders || customer.hasOnlineOrders) && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {customer.hasKioskOrders && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-200">
                                  <Monitor size={10} /> Totem / Kiosk
                                </span>
                              )}
                              {customer.hasOnlineOrders && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200">
                                  <Smartphone size={10} /> App / Online
                                </span>
                              )}
                            </div>
                          )}
                          {customer.phone && (
                            <a 
                              href={`https://wa.me/${getCleanWhatsAppPhone(customer.phone, settings?.whatsappCountryCode || '+1')}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-gray-700 hover:text-green-600 transition-colors font-semibold"
                            >
                              <MessageCircle size={14} className="text-green-600" />
                              <span className="text-black">{customer.phone}</span>
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button 
                            onClick={() => setViewingCustomerOrders(customer)}
                            className="bg-[#865d39]/10 hover:bg-[#865d39]/20 text-[#865d39] px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap cursor-pointer transition-all border border-[#865d39]/20"
                            title="Ver Histórico de Pedidos"
                          >
                            {customer.totalOrders} {customer.totalOrders === 1 ? 'Pedido' : 'Pedidos'}
                          </button>
                          <button 
                            onClick={() => {
                              setIsEditingCustomer(customer);
                              setEditCustomerForm({
                                name: customer.name,
                                phone: formatPhoneByCountry(customer.phone, settings?.whatsappCountryCode || '+55'),
                                email: customer.email,
                                birthday: customer.birthday,
                                address: customer.address,
                                isB2B: customer.isB2B,
                                managerName: customer.managerName,
                                street: customer.street,
                                number: customer.number,
                                zipCode: customer.zipCode,
                                city: customer.city,
                                frequency: customer.frequency
                              });
                            }}
                            className="p-1.5 text-amber-900 hover:bg-amber-50 hover:text-amber-950 bg-white shadow-sm border border-amber-200 rounded-lg flex items-center justify-center transition-all cursor-pointer"
                            title="Editar Cliente"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => {
                              setConfirmModal({
                                  isOpen: true,
                                  title: 'Excluir Cliente',
                                  message: `Tem certeza que deseja excluir o cliente ${customer.name} e todos os seus ${customer.totalOrders} pedidos?`,
                                  onConfirm: () => deleteCustomer(customer)
                              });
                            }}
                            className="p-1.5 text-red-650 hover:bg-red-50 hover:text-red-700 bg-white shadow-sm border border-gray-200 rounded-lg flex items-center justify-center transition-all cursor-pointer"
                            title="Excluir Cliente"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        {customer.email && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <span className="font-bold text-black">E-mail:</span>
                            <span className="text-black">{customer.email}</span>
                          </div>
                        )}
                        {customer.birthday && (() => {
                          const isBdayUpcoming = isBirthdayThisWeek(customer.birthday, customer.orderLanguage);
                          return (
                            <div className="space-y-2">
                              {isBdayUpcoming ? (
                                <>
                                  <div className="flex items-center gap-2 text-pink-600 font-bold">
                                    <Cake size={14} />
                                    <span>Aniversário: {customer.birthday} (Esta semana! 🎉)</span>
                                  </div>
                                  <div className="flex flex-col gap-1.5 p-3 bg-pink-500/10 border border-pink-500/20 rounded-2xl mt-1.5">
                                    <span className="text-[10px] uppercase font-black text-pink-800 tracking-wider">
                                      🎁 Enviar Mensagem de Feliz Aniversário:
                                    </span>
                                    <div className="w-full">
                                      <a 
                                        href={`https://wa.me/${getCleanWhatsAppPhone(customer.phone)}?text=${encodeURIComponent(
                                          `Parabéns, ${customer.name}! 🎉 A equipe da ${settings?.brandName || 'Escola de gastronomia e negócios'} te deseja um feliz aniversário! Que o seu dia seja repleto de realizações, sucesso e muito aprendizado. Como nosso presente para comemorar seu dia, preparamos uma oferta especial com surpresa no seu próximo pedido! 🎂🎁`
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-[#4a2e18] hover:bg-[#3b2413] active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                                      >
                                        <MessageCircle size={13} className="text-white" />
                                        <span>WhatsApp</span>
                                      </a>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center gap-2 text-gray-700">
                                  <span className="font-bold text-black">Aniversário:</span>
                                  <span className="text-black">{customer.birthday}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {customer.address && (
                          <div className="flex items-start gap-2 text-gray-700">
                            <span className="font-bold text-black flex-shrink-0">Endereço:</span>
                            <span className="line-clamp-2 text-black font-medium">{customer.address}</span>
                          </div>
                        )}
                      </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-between items-center text-xs text-gray-600 font-medium">
                    <span>Último pedido:</span>
                    <span className="font-bold text-black">
                      {customer.lastOrder?.toDate 
                        ? customer.lastOrder.toDate().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) 
                        : 'N/A'}
                    </span>
                  </div>
                </motion.div>
              )})}
          </div>
        </motion.div>
      )}

      {activeTab === 'pricing' && (
        <PricingAdmin settings={settings} products={products} />
      )}
      
      <div className="mt-32 pt-16 pb-32 border-t border-gray-200/40 w-full">
        <Footer settings={settings} hideActionButtons={true} />
      </div>
      </main>

      <AnimatePresence>
        {showFinancePeriodOrdersModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="bg-white p-6 md:p-8 rounded-3xl w-full max-w-3xl shadow-2xl space-y-5 max-h-[90vh] flex flex-col border border-gray-200 text-black"
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">
                    Detalhamento do Período Financeiro
                  </span>
                  <h3 className="text-2xl font-serif font-bold text-gray-900 mt-0.5">
                    Pedidos no Período ({filteredFinanceOrders.length})
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Período selecionado:{' '}
                    <strong className="text-gray-800">
                      {financeStartDate
                        ? new Date(financeStartDate + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                        : 'Início'}
                    </strong>{' '}
                    até{' '}
                    <strong className="text-gray-800">
                      {financeEndDate
                        ? new Date(financeEndDate + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                        : 'Hoje'}
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFinancePeriodOrdersModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-900 cursor-pointer"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="overflow-y-auto flex-grow space-y-3 pr-1">
                {filteredFinanceOrders.length === 0 ? (
                  <div className="py-12 text-center rounded-2xl bg-gray-50 border border-dashed border-gray-200 space-y-1.5">
                    <p className="text-sm font-bold text-gray-700">Nenhum pedido registrado neste período.</p>
                    <p className="text-xs text-gray-500">Altere as datas do filtro financeiro para visualizar outros períodos.</p>
                  </div>
                ) : (
                  filteredFinanceOrders.map((order) => {
                    const orderDateStr = order.createdAt?.toDate
                      ? order.createdAt.toDate().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                      : order.pickupDate || 'N/A';
                    const orderLabel = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-4).toUpperCase()}`;
                    return (
                      <div
                        key={order.id}
                        className="p-4 rounded-2xl border border-gray-200 bg-gray-50/70 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-xs font-black">
                              {orderLabel}
                            </span>
                            <span className="font-bold text-sm text-gray-900 truncate">
                              {order.isB2B || order.isPJ ? (order.b2bCompanyName || order.customerName) : order.customerName}
                            </span>
                            <span className="text-[11px] font-semibold text-gray-500">
                              • {orderDateStr}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {(order.items || []).map(i => `${i.quantity}x ${i.title}`).join(' • ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                          <span className="font-black text-base text-emerald-900 tabular-nums">
                            {currencySymbol} {Number(order.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <button
                            type="button"
                            onClick={() => printOrder(order)}
                            className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 cursor-pointer"
                            title="Imprimir Pedido"
                          >
                            <Printer size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 flex items-center justify-between gap-4">
                <div className="text-xs font-bold text-gray-600 uppercase">
                  Total de {filteredFinanceOrders.length} {filteredFinanceOrders.length === 1 ? 'pedido' : 'pedidos'}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-black text-emerald-800 tabular-nums">
                    {currencySymbol} {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFinancePeriodOrdersModal(false)}
                    className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {isEditingCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-6 md:p-8 rounded-3xl w-full max-w-2xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto border border-gray-200 text-black"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-serif font-bold">Editar Cliente</h3>
                <button onClick={() => setIsEditingCustomer(null)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={updateCustomer} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Nome do Cliente</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={editCustomerForm.name || ''}
                      onChange={e => setEditCustomerForm({...editCustomerForm, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">WhatsApp</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={formatPhoneByCountry(editCustomerForm.phone || '', settings?.whatsappCountryCode || '+55')}
                      placeholder={COUNTRY_OPTIONS[settings?.whatsappCountryCode || '+55']?.placeholder || '(99) 99999-9999'}
                      onChange={e => setEditCustomerForm({...editCustomerForm, phone: formatPhoneByCountry(e.target.value, settings?.whatsappCountryCode || '+55')})}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">E-mail</label>
                    <input 
                      type="email" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={editCustomerForm.email || ''}
                      onChange={e => setEditCustomerForm({...editCustomerForm, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Aniversário (Mês/Dia)</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={editCustomerForm.birthday || ''}
                      placeholder="MM/DD"
                      onChange={e => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 4) val = val.slice(0, 4);
                        if (val.length > 2) {
                          val = val.slice(0, 2) + '/' + val.slice(2);
                        }
                        setEditCustomerForm({...editCustomerForm, birthday: val});
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Rua / Logradouro</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={editCustomerForm.street || ''}
                      onChange={e => setEditCustomerForm({...editCustomerForm, street: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Número</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={editCustomerForm.number || ''}
                      onChange={e => setEditCustomerForm({...editCustomerForm, number: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">CEP</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 font-mono"
                      value={editCustomerForm.zipCode || ''}
                      onChange={e => setEditCustomerForm({...editCustomerForm, zipCode: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Cidade / Estado</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={editCustomerForm.city || ''}
                      onChange={e => setEditCustomerForm({...editCustomerForm, city: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-60">Endereço Completo</label>
                  <input 
                    type="text" 
                    className="w-full p-3 rounded-xl border border-gray-300 opacity-80"
                    value={editCustomerForm.address || ''}
                    onChange={e => setEditCustomerForm({...editCustomerForm, address: e.target.value})}
                  />
                </div>
                 <button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2"
                  style={{ 
                    backgroundColor: settings?.primaryColor || '#865d39',
                    color: getContrastText(settings?.primaryColor || '#865d39')
                  }}
                >
                  {isSaving ? <Loader2 className="animate-spin" /> : 'Salvar Alterações'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isRegisteringCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-6 md:p-8 rounded-3xl w-full max-w-2xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto border border-gray-200 text-black"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-serif font-bold">Cadastrar Cliente</h3>
                <button onClick={() => setIsRegisteringCustomer(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={saveNewCustomer} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Nome do Cliente</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={newCustomerForm.name || ''}
                      onChange={e => setNewCustomerForm({...newCustomerForm, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">WhatsApp / Telefone</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={formatPhoneByCountry(newCustomerForm.phone || '', settings?.whatsappCountryCode || '+55')}
                      placeholder={COUNTRY_OPTIONS[settings?.whatsappCountryCode || '+55']?.placeholder || '(99) 99999-9999'}
                      onChange={e => setNewCustomerForm({...newCustomerForm, phone: formatPhoneByCountry(e.target.value, settings?.whatsappCountryCode || '+55')})}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">E-mail</label>
                    <input 
                      type="email" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={newCustomerForm.email || ''}
                      onChange={e => setNewCustomerForm({...newCustomerForm, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Aniversário (Mês/Dia)</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={newCustomerForm.birthday || ''}
                      placeholder="MM/DD"
                      onChange={e => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 4) val = val.slice(0, 4);
                        if (val.length > 2) {
                          val = val.slice(0, 2) + '/' + val.slice(2);
                        }
                        setNewCustomerForm({...newCustomerForm, birthday: val});
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Rua / Logradouro</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={newCustomerForm.street || ''}
                      onChange={e => setNewCustomerForm({...newCustomerForm, street: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Número</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={newCustomerForm.number || ''}
                      onChange={e => setNewCustomerForm({...newCustomerForm, number: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">CEP</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black font-mono"
                      value={newCustomerForm.zipCode || ''}
                      onChange={e => setNewCustomerForm({...newCustomerForm, zipCode: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Cidade / Estado</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={newCustomerForm.city || ''}
                      onChange={e => setNewCustomerForm({...newCustomerForm, city: e.target.value})}
                    />
                  </div>
                </div>
                 <button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2"
                  style={{ 
                    backgroundColor: settings?.primaryColor || '#865d39',
                    color: getContrastText(settings?.primaryColor || '#865d39')
                  }}
                >
                  {isSaving ? <Loader2 className="animate-spin" /> : 'Cadastrar Cliente'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isEditingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-6 md:p-8 rounded-3xl w-full max-w-2xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto border border-gray-200 text-black"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-serif font-bold">Editar Pedido</h3>
                <button onClick={() => setIsEditingOrder(null)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleEditOrder} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Nome do Cliente</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={editOrderForm.customerName || ''}
                      onChange={e => setEditOrderForm({...editOrderForm, customerName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">WhatsApp</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={formatPhoneByCountry(editOrderForm.phone || '', settings?.whatsappCountryCode || '+55')}
                      placeholder={COUNTRY_OPTIONS[settings?.whatsappCountryCode || '+55']?.placeholder || '(99) 99999-9999'}
                      onChange={e => setEditOrderForm({...editOrderForm, phone: formatPhoneByCountry(e.target.value, settings?.whatsappCountryCode || '+55')})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Email</label>
                    <input 
                      type="email" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={editOrderForm.email || ''}
                      onChange={e => setEditOrderForm({...editOrderForm, email: e.target.value})}
                    />
                  </div>
                   <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Aniversário (Mês/Dia)</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300"
                      value={editOrderForm.birthday || ''}
                      placeholder="MM/DD"
                      onChange={e => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 4) val = val.slice(0, 4);
                        if (val.length > 2) {
                          val = val.slice(0, 2) + '/' + val.slice(2);
                        }
                        setEditOrderForm({...editOrderForm, birthday: val});
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-60">Endereço</label>
                  <input 
                    type="text" 
                    className="w-full p-3 rounded-xl border border-gray-300"
                    value={editOrderForm.address || ''}
                    onChange={e => setEditOrderForm({...editOrderForm, address: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-amber-800" /> Data de Entrega / Retirada
                      </span>
                      {editOrderForm.pickupDate && (
                        <span className="text-[11px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                          {editOrderForm.pickupDate}
                        </span>
                      )}
                    </label>
                    <div className="space-y-1.5">
                      <input 
                        type="date" 
                        className="w-full p-3 rounded-xl border border-gray-300 bg-white font-bold text-gray-900 cursor-pointer shadow-xs outline-none focus:ring-2 focus:ring-amber-500/20"
                        style={{ colorScheme: 'light' }}
                        value={(() => {
                          const val = editOrderForm.pickupDate || '';
                          if (val.includes('/')) {
                            const [d, m, y] = val.split('/');
                            if (d && m && y && y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                          }
                          return val;
                        })()}
                        onChange={e => {
                          const dateVal = e.target.value; // YYYY-MM-DD
                          if (dateVal.includes('-')) {
                            const [y, m, d] = dateVal.split('-');
                            setEditOrderForm({...editOrderForm, pickupDate: `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`});
                          } else {
                            setEditOrderForm({...editOrderForm, pickupDate: dateVal});
                          }
                        }}
                        onClick={e => {
                          try {
                            (e.target as any).showPicker?.();
                          } catch (_) {}
                        }}
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-gray-400">Atalhos:</span>
                        {[
                          { label: 'Hoje', days: 0 },
                          { label: 'Amanhã', days: 1 },
                          { label: '+2 Dias', days: 2 },
                          { label: '+7 Dias', days: 7 }
                        ].map(quick => {
                          const targetDate = new Date();
                          targetDate.setDate(targetDate.getDate() + quick.days);
                          const y = targetDate.getFullYear();
                          const m = String(targetDate.getMonth() + 1).padStart(2, '0');
                          const d = String(targetDate.getDate()).padStart(2, '0');
                          return (
                            <button
                              key={quick.label}
                              type="button"
                              onClick={() => setEditOrderForm({...editOrderForm, pickupDate: `${d}/${m}/${y}`})}
                              className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 cursor-pointer transition-colors"
                            >
                              {quick.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Preço Final (Total)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold opacity-40">{currencySymbol}</span>
                      <input 
                        type="number" 
                        step="0.01"
                        className="w-full p-3 pl-12 rounded-xl border border-gray-300 font-bold text-gray-900 focus:ring-2 focus:ring-amber-500/20"
                        value={editOrderForm.total || 0}
                        onChange={e => setEditOrderForm({...editOrderForm, total: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                </div>

                {/* --- SEÇÃO DE ITENS DO PEDIDO --- */}
                <div className="space-y-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-gray-800">Itens do Pedido</h4>
                    <span className="text-xs font-semibold text-gray-500">
                      {(editOrderForm.items || []).length} { (editOrderForm.items || []).length === 1 ? 'item' : 'itens' }
                    </span>
                  </div>
                  
                  {editOrderForm.items && editOrderForm.items.length > 0 ? (
                    <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-1">
                      {editOrderForm.items.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-200 gap-3 text-gray-900 shadow-xs">
                          <div className="flex-grow min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-sm text-gray-900">{item.title}</p>
                              {item.isCustomItem && (
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                  Item Avulso (Fora do Cardápio)
                                </span>
                              )}
                            </div>
                            {item.selectedSize && (
                              <p className="text-xs text-gray-600 font-semibold">Tamanho: {item.selectedSize.name}</p>
                            )}
                            {item.sandwichOptions && item.sandwichOptions.fillings && item.sandwichOptions.fillings.length > 0 && (
                              <div className="text-xs text-gray-600 space-y-0.5 mt-0.5">
                                <p>Recheios: {item.sandwichOptions.fillings.join(', ')}</p>
                              </div>
                            )}
                            {item.cakeOptions && (
                              <div className="text-xs text-gray-600 space-y-0.5 mt-0.5">
                                {item.cakeOptions.size && <p>Tamanho: {item.cakeOptions.size}</p>}
                                {item.cakeOptions.dough && <p>Massa: {item.cakeOptions.dough}</p>}
                                {item.cakeOptions.fillings && item.cakeOptions.fillings.length > 0 && (
                                  <p>Recheios: {item.cakeOptions.fillings.join(', ')}</p>
                                )}
                                {item.cakeOptions.topping && <p>Cobertura: {item.cakeOptions.topping}</p>}
                                {item.cakeOptions.topper && <p>Topper: {item.cakeOptions.topper}</p>}
                              </div>
                            )}
                            {item.mealOptions && (
                              <div className="text-xs text-gray-600 space-y-0.5 mt-0.5">
                                {item.mealOptions.removals && item.mealOptions.removals.length > 0 && (
                                  <p>Sem: {item.mealOptions.removals.join(', ')}</p>
                                )}
                                {item.mealOptions.sides && item.mealOptions.sides.length > 0 && (
                                  <p>Extras: {item.mealOptions.sides.map(s => s.name).join(', ')}</p>
                                )}
                              </div>
                            )}
                            {item.observation && (
                              <p className="text-xs text-amber-800 italic mt-0.5">Obs: {item.observation}</p>
                            )}
                            
                            {/* Editable price input with currency formatting */}
                            <div className="flex items-center gap-1.5 mt-2 text-xs">
                              <span className="font-bold text-gray-500">Preço Unitário: {currencySymbol}</span>
                              <input 
                                type="number" 
                                step="0.01" 
                                className="w-24 px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-gray-900 font-bold text-xs" 
                                value={item.price} 
                                onChange={e => {
                                  const newPrice = parseFloat(e.target.value) || 0;
                                  const updatedItems = [...(editOrderForm.items || [])];
                                  updatedItems[index].price = newPrice;
                                  updateOrderFormWithItems(updatedItems);
                                }} 
                              />
                              <span className="text-gray-400 font-bold">× {item.quantity} =</span>
                              <strong className="text-gray-900 font-bold">
                                {currencySymbol} {((item.price || 0) * (item.quantity || 1)).toFixed(2).replace('.', ',')}
                              </strong>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden bg-white shadow-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedItems = [...(editOrderForm.items || [])];
                                  if (updatedItems[index].quantity > 1) {
                                    updatedItems[index].quantity -= 1;
                                    updateOrderFormWithItems(updatedItems);
                                  }
                                }}
                                className="px-2.5 py-1 hover:bg-gray-100 font-bold border-r border-gray-200 text-black cursor-pointer"
                              >
                                -
                              </button>
                              <span className="px-3 py-1 font-bold text-sm min-w-[24px] text-center text-black">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedItems = [...(editOrderForm.items || [])];
                                  updatedItems[index].quantity += 1;
                                  updateOrderFormWithItems(updatedItems);
                                }}
                                className="px-2.5 py-1 hover:bg-gray-100 font-bold border-l border-gray-200 text-black cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updatedItems = (editOrderForm.items || []).filter((_, idx) => idx !== index);
                                updateOrderFormWithItems(updatedItems);
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-xl transition-all cursor-pointer"
                              title="Excluir item"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm opacity-50 italic text-gray-500">Nenhum item neste pedido.</p>
                  )}

                  {/* Add item interface with tabs */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-700">Adicionar Item ao Pedido</p>
                      <div className="flex items-center bg-gray-200/80 p-0.5 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setEditItemTab('catalog')}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                            editItemTab === 'catalog' ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                          )}
                        >
                          Do Cardápio
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditItemTab('custom')}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                            editItemTab === 'custom' ? "bg-purple-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
                          )}
                        >
                          Fora do Cardápio (Avulso)
                        </button>
                      </div>
                    </div>

                    {editItemTab === 'catalog' ? (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <select
                          value={selectedProductId}
                          onChange={e => setSelectedProductId(e.target.value)}
                          className="flex-grow p-3 rounded-xl border border-gray-300 bg-white text-sm text-black"
                        >
                          <option value="">-- Selecione um produto do cardápio --</option>
                          {products.flatMap(p => {
                            if (p.hasSizes && p.sizes && p.sizes.length > 0) {
                              return p.sizes.map(s => (
                                <option key={`${p.id}::${s.id || s.name}`} value={`${p.id}::${s.id || s.name}`}>
                                  {p.title} - {s.name} ({currencySymbol} {s.price.toFixed(2)})
                                </option>
                              ));
                            } else {
                              const activePrice = (p.price && p.price > 0) ? p.price : (p.oldPrice || 0);
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.title} ({currencySymbol} {activePrice.toFixed(2)})
                                </option>
                              );
                            }
                          })}
                        </select>
                        
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="1"
                            className="w-16 p-3 rounded-xl border border-gray-300 text-center font-bold text-black bg-white"
                            value={addItemQuantity}
                            onChange={e => setAddItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!selectedProductId) return;
                              
                              let prodId = selectedProductId;
                              let sizeKey = '';
                              
                              if (selectedProductId.includes('::')) {
                                const parts = selectedProductId.split('::');
                                prodId = parts[0];
                                sizeKey = parts[1];
                              }
                              
                              const prod = products.find(p => p.id === prodId);
                              if (!prod) return;
                              
                              let activePrice = 0;
                              let itemTitle = prod.title;
                              let selectedSizeObj: any = undefined;
                              
                              if (sizeKey && prod.sizes) {
                                const foundSize = prod.sizes.find(s => (s.id === sizeKey || s.name === sizeKey));
                                if (foundSize) {
                                  activePrice = foundSize.price;
                                  selectedSizeObj = foundSize;
                                } else {
                                  activePrice = (prod.price && prod.price > 0) ? prod.price : (prod.oldPrice || 0);
                                }
                              } else {
                                activePrice = (prod.price && prod.price > 0) ? prod.price : (prod.oldPrice || 0);
                              }
                              
                              const newItem = {
                                title: itemTitle,
                                quantity: addItemQuantity,
                                price: activePrice,
                                selectedSize: selectedSizeObj,
                                cakeOptions: {},
                                mealOptions: {
                                  removals: [],
                                  sides: []
                                }
                              };
                              
                              const updatedItems = [...(editOrderForm.items || []), newItem];
                              updateOrderFormWithItems(updatedItems);
                              
                              // Reset selection
                              setSelectedProductId('');
                              setAddItemQuantity(1);
                              toast.success(`"${itemTitle}" adicionado ao pedido!`);
                            }}
                            disabled={!selectedProductId}
                            className="px-4 py-3 text-white font-bold rounded-xl text-xs sm:text-sm transition-all whitespace-nowrap uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                          >
                            Adicionar
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Formulário de Item Fora do Cardápio (Avulso / Personalizado) */
                      <div className="space-y-3 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2 space-y-1">
                            <label className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
                              Nome do Item / Produto Avulso *
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: Bolo Especial 3 Andares / Taxa Decoração"
                              className="w-full p-2.5 rounded-xl border border-amber-300 bg-white text-xs font-bold text-gray-900 focus:ring-2 focus:ring-amber-400 outline-none"
                              value={customItemTitle}
                              onChange={e => setCustomItemTitle(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
                              Preço Unitário ({currencySymbol}) *
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="0,00"
                              className="w-full p-2.5 rounded-xl border border-amber-300 bg-white text-xs font-bold text-gray-900 focus:ring-2 focus:ring-amber-400 outline-none font-mono"
                              value={customItemPriceInput}
                              onChange={e => {
                                const digits = e.target.value.replace(/\D/g, '');
                                if (!digits) {
                                  setCustomItemPriceInput('');
                                  return;
                                }
                                const num = parseInt(digits, 10) / 100;
                                setCustomItemPriceInput(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                              }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
                              Quantidade
                            </label>
                            <input
                              type="number"
                              min="1"
                              className="w-full p-2.5 rounded-xl border border-amber-300 bg-white text-xs font-bold text-center text-gray-900"
                              value={customItemQuantity}
                              onChange={e => setCustomItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            />
                          </div>
                          <div className="sm:col-span-3 space-y-1">
                            <label className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
                              Detalhes / Observação do Item (Opcional)
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: Recheio artesanal de nozes, topo de flores"
                              className="w-full p-2.5 rounded-xl border border-amber-300 bg-white text-xs text-gray-800"
                              value={customItemNotes}
                              onChange={e => setCustomItemNotes(e.target.value)}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!customItemTitle.trim()) {
                              toast.error('Informe o nome do item avulso.');
                              return;
                            }
                            const priceVal = customItemPriceInput 
                              ? (parseFloat(customItemPriceInput.replace(/\D/g, '')) / 100) 
                              : 0;
                            const newItem = {
                              title: customItemTitle.trim(),
                              quantity: customItemQuantity || 1,
                              price: priceVal,
                              observation: customItemNotes.trim() || undefined,
                              isCustomItem: true
                            };
                            const updatedItems = [...(editOrderForm.items || []), newItem];
                            updateOrderFormWithItems(updatedItems);
                            setCustomItemTitle('');
                            setCustomItemPriceInput('');
                            setCustomItemQuantity(1);
                            setCustomItemNotes('');
                            toast.success(`"${newItem.title}" adicionado como item avulso!`);
                          }}
                          className="w-full py-2.5 rounded-xl text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-98 flex items-center justify-center gap-1.5"
                          style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                        >
                          <Plus size={15} /> Inserir Item Fora do Cardápio
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-60">Observações Gerais</label>
                  <textarea 
                    className="w-full p-3 rounded-xl border border-gray-300 text-black text-sm"
                    rows={3}
                    value={editOrderForm.observation || ''}
                    onChange={e => setEditOrderForm({...editOrderForm, observation: e.target.value})}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      if (editOrderForm) {
                        sendOrderToWhatsApp(editOrderForm as Order, settings);
                      }
                    }}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 bg-[#4a2e18] hover:bg-[#3b2413]"
                    title="Enviar resumo atualizado do pedido ao cliente pelo WhatsApp"
                  >
                    <MessageCircle size={18} /> Reenviar no WhatsApp
                  </button>

                  <button 
                    type="submit"
                    className="flex-grow py-3.5 rounded-xl font-bold text-base shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                    style={{ 
                      backgroundColor: settings?.primaryColor || '#865d39',
                      color: getContrastText(settings?.primaryColor || '#865d39')
                    }}
                  >
                    <Save size={18} /> Salvar Alterações do Pedido
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isAddingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-6 md:p-8 rounded-3xl w-full max-w-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto text-black border border-gray-200"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-serif font-bold">Criar Pedido Manual</h3>
                <button onClick={() => setIsAddingOrder(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={24} />
                </button>
              </div>

              {/* Buscar Cliente Cadastrado (Opcional) */}
              <div className="space-y-2 relative">
                <label className="text-xs font-bold uppercase opacity-60">Buscar Cliente Cadastrado (Opcional)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-450" size={18} />
                  <input 
                    type="text" 
                    className="pl-10 w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                    placeholder="Digite o nome, whatsapp ou e-mail do cliente..."
                    value={orderCustomerSearch}
                    onChange={e => setOrderCustomerSearch(e.target.value)}
                  />
                </div>
                {orderCustomerSearch.trim().length > 0 && (() => {
                  const filtered = combinedCustomers.filter(c => 
                    c.name.toLowerCase().includes(orderCustomerSearch.toLowerCase()) ||
                    c.phone.includes(orderCustomerSearch) ||
                    (c.email && c.email.toLowerCase().includes(orderCustomerSearch.toLowerCase()))
                  );
                  if (filtered.length === 0) return null;
                  return (
                    <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1 divide-y divide-gray-100">
                      {filtered.map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          className="w-full text-left p-3 hover:bg-gray-50 flex flex-col cursor-pointer"
                          onClick={() => {
                            setManualOrderForm({
                              ...manualOrderForm,
                              customerName: c.name,
                              phone: c.phone || '',
                              email: c.email || '',
                              address: c.address || '',
                              street: c.street || '',
                              number: c.number || '',
                              zipCode: c.zipCode || '',
                              city: c.city || '',
                              birthday: c.birthday || ''
                            });
                            setOrderCustomerSearch('');
                          }}
                        >
                          <span className="font-bold text-sm text-black">{c.name}</span>
                          <span className="text-xs text-gray-500">{c.phone} {c.email ? `| ${c.email}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Form de Dados do Cliente e Pedido */}
              <form onSubmit={e => { e.preventDefault(); handleCreateManualOrder(); }} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Nome do Cliente</label>
                    <input 
                      type="text" 
                      required
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={manualOrderForm.customerName || ''}
                      onChange={e => setManualOrderForm({...manualOrderForm, customerName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">WhatsApp</label>
                    <input 
                      type="text" 
                      required
                      placeholder={COUNTRY_OPTIONS[settings?.whatsappCountryCode || '+55']?.placeholder || '(99) 99999-9999'}
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={formatPhoneByCountry(manualOrderForm.phone || '', settings?.whatsappCountryCode || '+55')}
                      onChange={e => setManualOrderForm({...manualOrderForm, phone: formatPhoneByCountry(e.target.value, settings?.whatsappCountryCode || '+55')})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">E-mail</label>
                    <input 
                      type="email" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={manualOrderForm.email || ''}
                      onChange={e => setManualOrderForm({...manualOrderForm, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Aniversário (Mês/Dia)</label>
                    <input 
                      type="text" 
                      placeholder="MM/DD"
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={manualOrderForm.birthday || ''}
                      onChange={e => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 4) val = val.slice(0, 4);
                        if (val.length > 2) {
                          val = val.slice(0, 2) + '/' + val.slice(2);
                        }
                        setManualOrderForm({...manualOrderForm, birthday: val});
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Rua / Logradouro</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={manualOrderForm.street || ''}
                      onChange={e => setManualOrderForm({...manualOrderForm, street: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Número</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={manualOrderForm.number || ''}
                      onChange={e => setManualOrderForm({...manualOrderForm, number: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">CEP</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black font-mono"
                      value={manualOrderForm.zipCode || ''}
                      onChange={e => setManualOrderForm({...manualOrderForm, zipCode: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-60">Cidade / Estado</label>
                    <input 
                      type="text" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                      value={manualOrderForm.city || ''}
                      onChange={e => setManualOrderForm({...manualOrderForm, city: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-60">Endereço Completo</label>
                  <input 
                    type="text" 
                    className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black opacity-80"
                    value={manualOrderForm.address || ''}
                    onChange={e => setManualOrderForm({...manualOrderForm, address: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-60 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-amber-800" /> Data de Retirada / Entrega
                    </span>
                    {manualOrderForm.pickupDate && (
                      <span className="text-[11px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                        {manualOrderForm.pickupDate}
                      </span>
                    )}
                  </label>
                  <div className="space-y-1.5">
                    <input 
                      type="date" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white font-bold text-gray-900 cursor-pointer shadow-xs outline-none focus:ring-2 focus:ring-amber-500/20"
                      style={{ colorScheme: 'light' }}
                      value={(() => {
                        const val = manualOrderForm.pickupDate || '';
                        if (val.includes('/')) {
                          const [d, m, y] = val.split('/');
                          if (d && m && y && y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                        }
                        return val;
                      })()}
                      onChange={e => {
                        const dateVal = e.target.value;
                        if (dateVal.includes('-')) {
                          const [y, m, d] = dateVal.split('-');
                          setManualOrderForm({...manualOrderForm, pickupDate: `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`});
                        } else {
                          setManualOrderForm({...manualOrderForm, pickupDate: dateVal});
                        }
                      }}
                      onClick={e => {
                        try {
                          (e.target as any).showPicker?.();
                        } catch (_) {}
                      }}
                    />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-gray-400">Atalhos:</span>
                      {[
                        { label: 'Hoje', days: 0 },
                        { label: 'Amanhã', days: 1 },
                        { label: '+2 Dias', days: 2 },
                        { label: '+7 Dias', days: 7 }
                      ].map(quick => {
                        const targetDate = new Date();
                        targetDate.setDate(targetDate.getDate() + quick.days);
                        const y = targetDate.getFullYear();
                        const m = String(targetDate.getMonth() + 1).padStart(2, '0');
                        const d = String(targetDate.getDate()).padStart(2, '0');
                        return (
                          <button
                            key={quick.label}
                            type="button"
                            onClick={() => setManualOrderForm({...manualOrderForm, pickupDate: `${d}/${m}/${y}`})}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 cursor-pointer transition-colors"
                          >
                            {quick.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Seção Adicionar Itens */}
                <div className="space-y-4 p-4 rounded-2xl bg-white/40 border border-gray-200">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-gray-800">Adicionar Itens ao Pedido</h4>
                  
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase opacity-60">Selecione o Produto</label>
                    <select
                      value={selectedManualProduct ? selectedManualProduct.id : ''}
                      onChange={e => {
                        const prod = products.find(p => p.id === e.target.value);
                        setSelectedManualProduct(prod || null);
                        setSelectedManualSize(null);
                        setSelectedManualMealRemovals([]);
                        setSelectedManualMealSides([]);
                        setSelectedManualCakeOptions({
                          size: '',
                          dough: '',
                          fillings: [],
                          topping: '',
                          topper: '',
                          styleNumber: 1
                        });
                      }}
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                    >
                      <option value="">-- Selecione um produto --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>

                  {selectedManualProduct && (
                    <div className="space-y-4 p-4 rounded-xl bg-white border border-gray-200/60 shadow-sm">
                      <p className="font-bold text-sm text-gray-800">{selectedManualProduct.title}</p>

                      {/* Variantes/Tamanhos */}
                      {selectedManualProduct.hasSizes && selectedManualProduct.sizes && selectedManualProduct.sizes.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase opacity-60">Escolha o Tamanho</label>
                          <select
                            value={selectedManualSize ? selectedManualSize.name : ''}
                            onChange={e => {
                              const sz = selectedManualProduct.sizes?.find(s => s.name === e.target.value);
                              setSelectedManualSize(sz || null);
                            }}
                            className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-black text-sm"
                          >
                            <option value="">-- Escolha um tamanho --</option>
                            {selectedManualProduct.sizes.map((s, idx) => (
                              <option key={idx} value={s.name}>
                                {s.name} - {currencySymbol} {s.price.toFixed(2)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Marmita/Prato */}
                      {selectedManualProduct.isMeal && (
                        <div className="space-y-3">
                          {selectedManualProduct.ingredients && (
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase opacity-60">Remover Ingredientes (Se desejar)</label>
                              <div className="flex flex-wrap gap-2">
                                {selectedManualProduct.ingredients.split(',').map(i => i.trim()).filter(Boolean).map((ing, idx) => {
                                  const isRemoved = selectedManualMealRemovals.includes(ing);
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        if (isRemoved) {
                                          setSelectedManualMealRemovals(selectedManualMealRemovals.filter(r => r !== ing));
                                        } else {
                                          setSelectedManualMealRemovals([...selectedManualMealRemovals, ing]);
                                        }
                                      }}
                                      className={cn(
                                        "px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer",
                                        isRemoved 
                                          ? "bg-red-50 border-red-200 text-red-600 line-through" 
                                          : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                                      )}
                                    >
                                      Sem {ing}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {sides.length > 0 && (
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase opacity-60">Adicionar Acompanhamentos</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {sides.map((sideOpt, idx) => {
                                  const isSelected = selectedManualMealSides.some(s => s.name === sideOpt.name);
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        if (isSelected) {
                                          setSelectedManualMealSides(selectedManualMealSides.filter(s => s.name !== sideOpt.name));
                                        } else {
                                          setSelectedManualMealSides([...selectedManualMealSides, sideOpt]);
                                        }
                                      }}
                                      className={cn(
                                        "p-2.5 rounded-xl border transition-all flex items-center justify-between text-left text-xs font-bold cursor-pointer",
                                        isSelected 
                                          ? "border-[#865d39] bg-[#865d39]/10 text-[#865d39]" 
                                          : "bg-white border-gray-200 hover:border-gray-300 text-gray-750"
                                      )}
                                    >
                                      <span>{sideOpt.name}</span>
                                      <span className="opacity-70 font-mono">+{currencySymbol} {sideOpt.price.toFixed(2)}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Custom Cake */}
                      {selectedManualProduct.isCustomCake && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Cake Size */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase opacity-60">Tamanho do Bolo</label>
                              <select
                                value={selectedManualCakeOptions.size || ''}
                                onChange={e => setSelectedManualCakeOptions({...selectedManualCakeOptions, size: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-black text-xs"
                              >
                                <option value="">-- Escolha o tamanho --</option>
                                {(settings.cakeSizes || []).map((sz, idx) => (
                                  <option key={idx} value={sz}>{sz}</option>
                                ))}
                              </select>
                            </div>

                            {/* Cake Dough */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase opacity-60">Massa do Bolo</label>
                              <select
                                value={selectedManualCakeOptions.dough || ''}
                                onChange={e => setSelectedManualCakeOptions({...selectedManualCakeOptions, dough: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-black text-xs"
                              >
                                <option value="">-- Escolha a massa --</option>
                                {(settings.cakeDoughs || []).map((dg, idx) => (
                                  <option key={idx} value={dg}>{dg}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Cake Fillings */}
                          {(settings.cakeFillings || []).length > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center text-[10px] font-bold uppercase opacity-60">
                                <span>Opções de Recheio</span>
                                <span className="opacity-60">Escolha até {settings.cakeFillingsMax || 2}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {(settings.cakeFillings || []).map((fill, idx) => {
                                  const isSelected = (selectedManualCakeOptions.fillings || []).includes(fill);
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        const current = selectedManualCakeOptions.fillings || [];
                                        if (isSelected) {
                                          setSelectedManualCakeOptions({
                                            ...selectedManualCakeOptions,
                                            fillings: current.filter((f: string) => f !== fill)
                                          });
                                        } else {
                                          const max = settings.cakeFillingsMax || 2;
                                          if (current.length >= max) {
                                            toast.error(`Você pode escolher no máximo ${max} recheios!`);
                                            return;
                                          }
                                          setSelectedManualCakeOptions({
                                            ...selectedManualCakeOptions,
                                            fillings: [...current, fill]
                                          });
                                        }
                                      }}
                                      className={cn(
                                        "p-2 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer",
                                        isSelected 
                                          ? "border-[#865d39] bg-[#865d39]/10 text-[#865d39]" 
                                          : "bg-white border-gray-200 hover:border-gray-300 text-gray-750"
                                      )}
                                    >
                                      {fill}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Cake Topping */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase opacity-60">Cobertura do Bolo</label>
                              <select
                                value={selectedManualCakeOptions.topping || ''}
                                onChange={e => setSelectedManualCakeOptions({...selectedManualCakeOptions, topping: e.target.value})}
                                className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-black text-xs"
                              >
                                <option value="">-- Escolha a cobertura --</option>
                                {(settings.cakeToppings || []).map((tp, idx) => (
                                  <option key={idx} value={tp}>{tp}</option>
                                ))}
                              </select>
                            </div>

                            {/* Cake Topper */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase opacity-60">Texto do Topper (Opcional)</label>
                              <input
                                type="text"
                                placeholder="Ex: Feliz Aniversário!"
                                className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-black text-xs"
                                value={selectedManualCakeOptions.topper || ''}
                                onChange={e => setSelectedManualCakeOptions({...selectedManualCakeOptions, topper: e.target.value})}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Quantidade e Adicionar */}
                      <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() => setManualProductQty(Math.max(1, manualProductQty - 1))}
                            className="px-3 py-2 hover:bg-gray-150 font-bold border-r border-gray-250 text-black text-sm cursor-pointer"
                          >
                            -
                          </button>
                          <span className="px-4 py-2 font-bold text-sm min-w-[32px] text-center text-black">{manualProductQty}</span>
                          <button
                            type="button"
                            onClick={() => setManualProductQty(manualProductQty + 1)}
                            className="px-3 py-2 hover:bg-gray-150 font-bold border-l border-gray-250 text-black text-sm cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        
                        <button
                          type="button"
                          onClick={handleAddManualItem}
                          className="flex-grow py-3 text-white font-bold rounded-xl text-sm transition-all uppercase tracking-wider shadow-md cursor-pointer active:scale-98"
                          style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                        >
                          Adicionar Item ao Pedido
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista de Itens no Pedido Manual */}
                  {manualOrderItems.length > 0 ? (
                    <div className="space-y-2 mt-4">
                      <p className="text-xs font-bold uppercase opacity-60 text-gray-700">Itens Adicionados ({manualOrderItems.length})</p>
                      <div className="space-y-2 max-h-[25vh] overflow-y-auto pr-1">
                        {manualOrderItems.map((item, idx) => (
                          <div key={item.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl shadow-sm gap-3">
                            <div>
                              <p className="font-bold text-sm text-black">{item.title}</p>
                              <p className="text-xs text-gray-500 font-semibold">
                                {item.quantity}x {currencySymbol} {item.price.toFixed(2)} | Subtotal: {currencySymbol} {(item.price * item.quantity).toFixed(2)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setManualOrderItems(manualOrderItems.filter(it => it.id !== item.id));
                              }}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                              title="Remover Item"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                        <span className="font-bold text-sm text-gray-700">Total do Pedido:</span>
                        <span className="font-black text-lg text-amber-900" style={{ color: settings?.primaryColor || '#865d39' }}>
                          {currencySymbol} {manualOrderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-400 text-xs italic bg-white/50 border border-dashed border-gray-200 rounded-xl">
                      Nenhum item adicionado a este pedido ainda.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-60">Observações Gerais</label>
                  <textarea 
                    className="w-full p-3 rounded-xl border border-gray-300 bg-white text-black"
                    rows={3}
                    placeholder="Ex: Cliente vai retirar às 14h, embalar para presente..."
                    value={manualOrderForm.observation || ''}
                    onChange={e => setManualOrderForm({...manualOrderForm, observation: e.target.value})}
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2"
                  style={{ 
                    backgroundColor: settings?.primaryColor || '#865d39',
                    color: getContrastText(settings?.primaryColor || '#865d39')
                  }}
                >
                  {isSaving ? <Loader2 className="animate-spin" /> : 'Confirmar e Criar Pedido'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {viewingCustomerOrders && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-6 md:p-8 rounded-3xl w-full max-w-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto border border-gray-200 text-black"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs uppercase font-extrabold tracking-widest bg-[#865d39]/10 text-[#865d39] px-2.5 py-1 rounded-full border border-[#865d39]/10">
                    Histórico do Cliente
                  </span>
                  <h3 className="text-2xl font-serif font-bold text-black">{viewingCustomerOrders.name}</h3>
                  <p className="text-sm opacity-60">
                    {viewingCustomerOrders.phone} | {viewingCustomerOrders.email || 'Sem e-mail'}
                  </p>
                </div>
                <button 
                  onClick={() => setViewingCustomerOrders(null)} 
                  className="p-2 hover:bg-black/5 rounded-full cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="font-bold text-sm uppercase tracking-wider opacity-50">
                  Pedidos Realizados ({viewingCustomerOrders.orders.length})
                </h4>
                
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                  {viewingCustomerOrders.orders.map((order: Order, index: number) => (
                    <div 
                      key={order.id} 
                      className="p-5 bg-white/50 border border-black/5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/70 transition-all"
                    >
                      <div className="space-y-2 flex-grow">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 bg-black/5 rounded text-gray-700">
                            #{order.id.slice(-6).toUpperCase()}
                          </span>
                          <span className="text-xs opacity-50">
                            {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-US') : 'N/A'}
                          </span>
                          {order.pickupDate && (
                            <span 
                              className="text-[10px] font-black px-2 py-0.5 rounded-md text-white whitespace-nowrap"
                              style={{ backgroundColor: settings?.primaryColor || '#865d39' }}
                            >
                              🚚 Entrega: {order.pickupDate}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 text-sm">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between font-medium">
                              <span>{item.quantity}x {item.title}</span>
                              <span className="opacity-60">{currencySymbol} {((item.price || 0) * item.quantity).toFixed(2).replace('.', ',')}</span>
                            </div>
                          ))}
                          
                          {order.total > 0 && order.taxAmount && order.taxAmount > 0 && (
                            <div className="border-t border-black/5 pt-2 space-y-1 text-xs text-black/60 font-semibold">
                              <div className="flex justify-between">
                                <span className="opacity-60">Subtotal:</span>
                                <span>{currencySymbol} {(order.subtotal || (order.total - order.taxAmount)).toFixed(2).replace('.', ',')}</span>
                              </div>
                              <div className="flex justify-between text-amber-900">
                                <span className="opacity-60">Imposto Estadual ({order.taxRate || 8.25}%):</span>
                                <span>+ {currencySymbol} {order.taxAmount.toFixed(2).replace('.', ',')}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {order.observation && (
                          <p className="text-xs italic bg-amber-500/10 text-amber-800 p-2.5 rounded-xl border border-amber-500/20">
                            <strong>Obs:</strong> {order.observation}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-row md:flex-col items-end justify-between md:justify-center gap-3 border-t md:border-t-0 border-black/5 pt-3 md:pt-0">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold opacity-40 block">Valor Pago</span>
                          <span className="text-lg font-black" style={{ color: settings?.primaryColor || '#865d39' }}>
                            {currencySymbol} {order.total.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => printOrder(order)}
                            className="p-2 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 shadow-sm cursor-pointer"
                            title="Imprimir"
                          >
                            <Printer size={16} />
                          </button>
                          <button 
                            onClick={() => {
                              setIsEditingOrder(order);
                              setEditOrderForm({ ...order, phone: formatPhoneByCountry(order.phone || '', settings?.whatsappCountryCode || '+55') });
                              setViewingCustomerOrders(null);
                            }}
                            className="p-2 bg-white border border-amber-200 rounded-xl text-amber-900 hover:bg-amber-50 shadow-sm cursor-pointer"
                            title="Editar Pedido"
                          >
                            <Edit2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass p-8 rounded-3xl w-full max-w-sm shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-serif font-bold">{confirmModal.title}</h3>
                <p className="text-sm opacity-60">{confirmModal.message}</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-black cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmModal.onConfirm}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold shadow-lg"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
