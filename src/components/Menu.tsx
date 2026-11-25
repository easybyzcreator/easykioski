import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, query, orderBy } from 'firebase/firestore';
import { Product, Order, Settings, Category, CartItem, Side, ProductSize, ImageGallery } from '../types';
import { Plus, Minus, ShoppingBag, X, MessageCircle, MessageSquare, Check, Calendar, Building2, User, Phone, MapPin, RefreshCw, ChevronDown, Truck, Navigation, Loader2, Lock, ArrowLeft, Info, ArrowRight, Layers, Sparkles, Menu as MenuIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { COUNTRY_OPTIONS, formatPhoneByCountry, getCleanWhatsAppPhone, getCurrencySymbol } from '../utils/countryUtils';
import { geocodeAddress, calculateDistanceKm, calculateDeliveryFee, fetchViaCep, DeliveryCalculation } from '../utils/deliveryUtils';
import { AnimatedProductCard } from './AnimatedProductCard';
import { TotemCheckoutModal } from './TotemCheckoutModal';
import { MobilePickupCheckoutModal } from './MobilePickupCheckoutModal';
import { PwaInstallBanner } from './PwaInstallBanner';
import { InactivityGuard } from './InactivityGuard';
import { BACKUP_CATEGORIES, BACKUP_PRODUCTS } from '../services/catalogSeedService';
import { formatMoney, getKioskDict, KioskLanguage } from '../utils/kioskI18n';
import {
  getLocalizedCategoryTitle,
  getLocalizedProduct,
  getLocalizedSideName,
  productRequiresCustomerSelection,
} from '../services/catalogTranslationService';
import { getBrandTheme } from '../utils/brandTheme';

const translations = {
  pt: {
    cartTitle: 'Seu Carrinho',
    emptyCart: 'Seu carrinho está vazio',
    total: 'Total',
    next: 'Próximo: Seus Dados',
    back: 'Voltar',
    finish: 'Finalizar Pedido',
    fullName: 'Nome Completo',
    phone: 'Telefone',
    email: 'E-mail',
    birthday: 'Aniversário (Mês/Dia)',
    birthdayPlaceholder: 'MM/DD',
    street: 'Rua/Avenida',
    number: 'Nº/Apto',
    zipCode: 'CEP',
    city: 'Cidade',
    state: 'Estado',
    observation: 'Observação',
    orderDetails: 'Detalhes do seu Pedido',
    customCakeTitle: 'Opções de Personalização',
    chooseModel: 'Escolha o Modelo',
    chooseSize: 'Escolha o Tamanho',
    chooseDough: 'Escolha a Massa',
    chooseFillings: 'Escolha os Recheios',
    chooseFrosting: 'Escolha a Cobertura',
    chooseSides: 'Escolha os Acompanhamentos',
    excludeIngredients: 'Excluir Ingredientes',
    limitReached: 'Limite atingido',
    addToCart: 'Adicionar ao Carrinho',
    whatsappOrder: 'Pedido',
    whatsappData: 'Dados do Cliente',
    whatsappItems: 'Itens do Pedido',
    whatsappTotal: 'Total do Pedido',
    whatsappDate: 'Data',
    whatsappAt: 'às',
    pickupDate: 'Data de Entrega/Retirada',
    pickupDatePlaceholder: 'MM/DD/YYYY',
    consultMessage: 'Existem itens no pedido com valores a consultar. Aguarde a confirmação pelo WhatsApp.'
  },
  en: {
    cartTitle: 'Your Cart',
    emptyCart: 'Your cart is empty',
    total: 'Total',
    next: 'Next: Your Details',
    back: 'Back',
    finish: 'Finish Order',
    fullName: 'Full Name',
    phone: 'Phone',
    email: 'E-mail',
    birthday: 'Birthday (Month/Day)',
    birthdayPlaceholder: 'MM/DD',
    street: 'Street/Avenue',
    number: 'No./Apt',
    zipCode: 'Zip Code',
    city: 'City',
    state: 'State',
    observation: 'Observation',
    orderDetails: 'Order Details',
    customCakeTitle: 'Customize your Order',
    chooseModel: 'Choose Model',
    chooseSize: 'Choose Size',
    chooseDough: 'Choose Dough',
    chooseFillings: 'Choose Fillings',
    chooseFrosting: 'Choose Frosting',
    chooseSides: 'Choose Sides',
    excludeIngredients: 'Exclude Ingredients',
    limitReached: 'Limit reached',
    addToCart: 'Add to Cart',
    whatsappOrder: 'Order',
    whatsappData: 'Customer Data',
    whatsappItems: 'Order Items',
    whatsappTotal: 'Order Total',
    whatsappDate: 'Date',
    whatsappAt: 'at',
    pickupDate: 'Pickup/Delivery Date',
    pickupDatePlaceholder: 'MM/DD/YYYY',
    consultMessage: 'There are items with values to be consulted. Please ask our staff for assistance.'
  },
  es: {
    cartTitle: 'Tu Pedido',
    emptyCart: 'Tu carrito está vacío',
    total: 'Total',
    next: 'Continuar',
    back: 'Volver',
    finish: 'Finalizar Pedido',
    fullName: 'Nombre',
    phone: 'Teléfono',
    email: 'Correo',
    birthday: 'Cumpleaños (Mes/Día)',
    birthdayPlaceholder: 'MM/DD',
    street: 'Calle/Avenida',
    number: 'N°/Apto',
    zipCode: 'Código Postal',
    city: 'Ciudad',
    state: 'Estado',
    observation: 'Notas',
    orderDetails: 'Detalles del Pedido',
    customCakeTitle: 'Personaliza tu Pedido',
    chooseModel: 'Elige el Modelo',
    chooseSize: 'Elige el Tamaño',
    chooseDough: 'Elige la Masa',
    chooseFillings: 'Elige los Rellenos',
    chooseFrosting: 'Elige la Cobertura',
    chooseSides: 'Elige los Acompañamientos',
    excludeIngredients: 'Retirar Ingredientes',
    limitReached: 'Límite alcanzado',
    addToCart: 'Agregar al Pedido',
    whatsappOrder: 'Pedido',
    whatsappData: 'Datos del Cliente',
    whatsappItems: 'Artículos del Pedido',
    whatsappTotal: 'Total del Pedido',
    whatsappDate: 'Fecha',
    whatsappAt: 'a las',
    pickupDate: 'Fecha de Retiro/Entrega',
    pickupDatePlaceholder: 'MM/DD/YYYY',
    consultMessage: 'Algunos artículos requieren confirmación de precio.'
  }
};

export const getContrastText = (hexColor?: string): string => {
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

export const getColorWithLegibility = (hexColor?: string, defaultColor: string = '#865d39'): string => {
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

const translateSettingsToEnglish = (s: Settings): Settings => {
  return {
    ...s,
    language: 'en',
    currency: 'USD',
    brandName: s.brandName || 'Escola de gastronomia e negócios',
    slogan: !s.slogan || s.slogan.includes('Alimentação saudável') || s.slogan.includes('Cursos completos')
      ? 'Complete gastronomy, confectionery, baking, and culinary business courses.'
      : s.slogan,
    introTitle: s.introTitle || 'Escola de gastronomia e negócios',
    introSubtitle: !s.introSubtitle || s.introSubtitle.includes('Alimentação Saudável') || s.introSubtitle.includes('Aprenda Gastronomia')
      ? 'Learn Authentic Gastronomy and Management'
      : s.introSubtitle,
    introDescription: !s.introDescription || s.introDescription.includes('Pratos nutritivos') || s.introDescription.includes('Acesse nossos')
      ? 'Access our professional trainings, signature recipes, consulting, and culinary business mentorship.'
      : s.introDescription,
    introButtonText: !s.introButtonText || s.introButtonText.includes('INICIAR') || s.introButtonText.includes('ACESSAR')
      ? 'ACCESS OUR MENU / COURSES'
      : s.introButtonText,
    introBottomText: !s.introBottomText || s.introBottomText.includes('ARTESANAL') || s.introBottomText.includes('CURSOS DE')
      ? 'GASTRONOMY & BUSINESS COURSES'
      : s.introBottomText,
    selectorTitle: s.selectorTitle || 'Escola de gastronomia e negócios',
    selectorSubtitle: !s.selectorSubtitle || s.selectorSubtitle.includes('Escolha')
      ? 'Choose your experience'
      : s.selectorSubtitle,
    catalog1Title: !s.catalog1Title || s.catalog1Title.includes('Cardápio') || s.catalog1Title.includes('Acarajé')
      ? 'Main Menu'
      : s.catalog1Title,
    catalog1Desc: !s.catalog1Desc || s.catalog1Desc.includes('Nossos pratos')
      ? 'Our fitness dishes and traditional healthy meals.'
      : s.catalog1Desc,
    catalog1Slogan: !s.catalog1Slogan || s.catalog1Slogan.includes('Refeições')
      ? 'Balanced meals made with love'
      : s.catalog1Slogan,
    catalog2Title: !s.catalog2Title || s.catalog2Title.includes('Bebidas')
      ? 'Drinks & Fit Sweets'
      : s.catalog2Title,
    catalog2Desc: !s.catalog2Desc || s.catalog2Desc.includes('Sucos')
      ? 'Natural juices, smoothies and sugar-free desserts.'
      : s.catalog2Desc,
    catalog2Slogan: !s.catalog2Slogan || s.catalog2Slogan.includes('Refrescância')
      ? 'Healthy freshness and sweetness for your day'
      : s.catalog2Slogan,
    catalog3Title: !s.catalog3Title || s.catalog3Title.includes('Low Carb') || s.catalog3Title.includes('Dietas')
      ? 'Low Carb Diets'
      : s.catalog3Title,
    catalog3Desc: !s.catalog3Desc || s.catalog3Desc.includes('Pratos com baixo')
      ? 'Low-carb, high-protein dishes.'
      : s.catalog3Desc,
    catalog3Slogan: !s.catalog3Slogan || s.catalog3Slogan.includes('Mais foco')
      ? 'More focus on your health and energy'
      : s.catalog3Slogan,
    catalog4Title: !s.catalog4Title || s.catalog4Title.includes('Hipertróficas') || s.catalog4Title.includes('Dietas')
      ? 'Hypertrophy Diets'
      : s.catalog4Title,
    catalog4Desc: !s.catalog4Desc || s.catalog4Desc.includes('Refeições com alto')
      ? 'Healthy high-calorie, protein-rich meals for muscle gain.'
      : s.catalog4Desc,
    catalog4Slogan: !s.catalog4Slogan || s.catalog4Slogan.includes('Combustível')
      ? 'High quality fuel for your workout'
      : s.catalog4Slogan,
    checkoutTitle: !s.checkoutTitle || s.checkoutTitle.includes('Ficamos')
      ? 'We are very happy with your order! Please review the details below.'
      : s.checkoutTitle,
    infoBlock1Title: !s.infoBlock1Title || s.infoBlock1Title.includes('CONFIRMAÇÃO')
      ? 'ORDER CONFIRMATION'
      : s.infoBlock1Title,
    infoBlock1Text: !s.infoBlock1Text || s.infoBlock1Text.includes('WhatsApp')
      ? 'After sending your request, we will contact you on WhatsApp to confirm details.'
      : s.infoBlock1Text,
    infoBlock2Title: !s.infoBlock2Title || s.infoBlock2Title.includes('RETIRADA')
      ? 'STORE PICKUP'
      : s.infoBlock2Title,
    infoBlock2Text: !s.infoBlock2Text || s.infoBlock2Text.includes('endereço') || s.infoBlock2Text.includes('retirada')
      ? 'Check our pickup hours and address details on the final confirmation.'
      : s.infoBlock2Text,
    whatsappClosingMessage: !s.whatsappClosingMessage || s.whatsappClosingMessage.includes('Obrigada')
      ? 'Thank you for your order, we will contact you shortly for confirmation!'
      : s.whatsappClosingMessage
  };
};

const cleanFirestoreObject = <T extends Record<string, any>>(obj: T): T => {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
};

export default function Menu({ 
  settings: initialSettings,
  mode = 'totem',
  onScreenChange,
  onSecretLogoUnlock
}: { 
  settings: Settings;
  mode?: 'totem' | 'mobile_pickup';
  onScreenChange?: (screen: 'intro' | 'selector' | 'menu') => void;
  onSecretLogoUnlock?: () => void;
}) {
  const isMobilePickup = mode === 'mobile_pickup';
  const [guestLanguage, setGuestLanguage] = useState<KioskLanguage | null>(null);
  const activeLanguage: KioskLanguage =
    guestLanguage ||
    ((initialSettings?.language === 'en' || initialSettings?.language === 'es' || initialSettings?.language === 'pt')
      ? initialSettings.language
      : 'en');

  const settings: Settings = {
    ...initialSettings,
    language: activeLanguage,
    currency: initialSettings?.currency || 'USD',
    salesTaxRate: typeof initialSettings?.salesTaxRate === 'number' ? initialSettings.salesTaxRate : 7.75,
    kioskInactivitySeconds: initialSettings?.kioskInactivitySeconds || 45
  };
  const t = translations[activeLanguage] || translations.en;
  const k = getKioskDict(activeLanguage);
  const currencySymbol = getCurrencySymbol(settings.currency);
  const theme = getBrandTheme(settings);

  // Secret 5-tap logo gesture (Totem mode only — disabled in Mobile Pickup mode)
  const logoTapTimestampsRef = useRef<number[]>([]);
  const handleLogoTap = useCallback(() => {
    if (isMobilePickup || !onSecretLogoUnlock) return;
    const now = Date.now();
    const recent = logoTapTimestampsRef.current.filter((ts) => now - ts < 2500);
    recent.push(now);
    logoTapTimestampsRef.current = recent;
    if (recent.length >= 5) {
      logoTapTimestampsRef.current = [];
      onSecretLogoUnlock();
    }
  }, [isMobilePickup, onSecretLogoUnlock]);

  const renderTitle = (title: string) => {
    if (title && title.toLowerCase() === 'escola de gastronomia e negócios') {
      return (
        <>
          Escola de gastronomia<br />e negócios
        </>
      );
    }
    return title;
  };

  const DEFAULT_CAKE_SIZES = [
    '7" - 15 a 20 Fatias (Aprox. 1.5kg)',
    '9" - 25 a 30 Fatias (Aprox. 2.5kg)',
    '12" - 40 a 50 Fatias (Aprox. 4.0kg)'
  ];

  const DEFAULT_CAKE_DOUGHS = [
    'Massa de Baunilha',
    'Massa de Chocolate 50% Cacau',
    'Massa Red Velvet'
  ];

  const DEFAULT_CAKE_FILLINGS = [
    'Brigadeiro Gourmet (Chocolate Belga)',
    'Beijinho de Coco (Tradicional)',
    'Doce de Leite Tradicional',
    'Creme de Ninho com Frutas Vermelhas'
  ];

  const DEFAULT_CAKE_TOPPINGS = [
    'Chantininho Cremoso (Ninho)',
    'Ganache de Chocolate Belga',
    'Buttercream Clássico'
  ];

  const DEFAULT_CAKE_TOPPERS = [
    'Nenhum',
    'Feliz Aniversário',
    'Parabéns'
  ];

  const cakeSizesList = (settings.cakeSizes && settings.cakeSizes.length > 0) ? settings.cakeSizes : DEFAULT_CAKE_SIZES;
  const cakeDoughsList = (settings.cakeDoughs && settings.cakeDoughs.length > 0) ? settings.cakeDoughs : DEFAULT_CAKE_DOUGHS;
  const cakeFillingsList = (settings.cakeFillings && settings.cakeFillings.length > 0) ? settings.cakeFillings : DEFAULT_CAKE_FILLINGS;
  const cakeToppingsList = (settings.cakeToppings && settings.cakeToppings.length > 0) ? settings.cakeToppings : DEFAULT_CAKE_TOPPINGS;
  const cakeToppersList = (settings.cakeToppers && settings.cakeToppers.length > 0) ? settings.cakeToppers : DEFAULT_CAKE_TOPPERS;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sides, setSides] = useState<Side[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [selectedProductForCustom, setSelectedProductForCustom] = useState<Product | null>(null);
  const [isDietsModalOpen, setIsDietsModalOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [mealSelections, setMealSelections] = useState<{
    removals: string[];
    sides: Side[];
  }>({
    removals: [],
    sides: []
  });
  const [sideQuantities, setSideQuantities] = useState<Record<string, number>>({});
  const [selectedCakeSize, setSelectedCakeSize] = useState<string>('');
  const [selectedDough, setSelectedDough] = useState<string>('');
  const [selectedFillings, setSelectedFillings] = useState<string[]>([]);
  const [selectedSandwichFillings, setSelectedSandwichFillings] = useState<string[]>([]);
  const [selectedTopping, setSelectedTopping] = useState<string>('');
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]); // dummy if needed, but not used now
  const [selectedTopper, setSelectedTopper] = useState<string>('');
  const [isMobileCategoryMenuOpen, setIsMobileCategoryMenuOpen] = useState(false);
  const mobileCatMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobileCategoryMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (mobileCatMenuRef.current && !mobileCatMenuRef.current.contains(event.target as Node)) {
        setIsMobileCategoryMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileCategoryMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileCategoryMenuOpen]);
  const [b2bName, setB2bName] = useState(() => {
    try {
      const saved = localStorage.getItem('b2b_profile_save');
      return saved ? JSON.parse(saved).name || '' : '';
    } catch {
      return '';
    }
  });
  const [b2bResponsibleName, setB2bResponsibleName] = useState(() => {
    try {
      const saved = localStorage.getItem('b2b_profile_save');
      return saved ? JSON.parse(saved).manager || '' : '';
    } catch {
      return '';
    }
  });
  const [b2bPhone, setB2bPhone] = useState(() => {
    try {
      const saved = localStorage.getItem('b2b_profile_save');
      return saved ? JSON.parse(saved).phone || '' : '';
    } catch {
      return '';
    }
  });
  const [b2bAddress, setB2bAddress] = useState(() => {
    try {
      const saved = localStorage.getItem('b2b_profile_save');
      return saved ? JSON.parse(saved).address || '' : '';
    } catch {
      return '';
    }
  });
  const [b2bZipCode, setB2bZipCode] = useState(() => {
    try {
      const saved = localStorage.getItem('b2b_profile_save');
      return saved ? JSON.parse(saved).zipCode || '' : '';
    } catch {
      return '';
    }
  });
  const [b2bCity, setB2bCity] = useState(() => {
    try {
      const saved = localStorage.getItem('b2b_profile_save');
      return saved ? JSON.parse(saved).city || '' : '';
    } catch {
      return '';
    }
  });
  const [b2bFrequency, setB2bFrequency] = useState<'one-time' | 'weekly'>('one-time');
  const [isReturningB2b, setIsReturningB2b] = useState(() => {
    try {
      return localStorage.getItem('b2b_profile_save') ? true : false;
    } catch {
      return false;
    }
  });
  const [b2bSearchResults, setB2bSearchResults] = useState<any[]>([]);
  const [showB2bSearchDropdown, setShowB2bSearchDropdown] = useState(false);
  const [b2bProfiles, setB2bProfiles] = useState<any[]>([]);
  const [pqCoquetel, setPqCoquetel] = useState(0);
  const [pqMedio, setPqMedio] = useState(0);
  const [pqPremium, setPqPremium] = useState(0);
  const [b2bDate, setB2bDate] = useState('');
  const [b2bObservation, setB2bObservation] = useState('');
  const [checkoutStep, setCheckoutStep] = useState<'summary' | 'form' | 'channels' | 'b2b_channels'>('summary');
  const [hasRedirected, setHasRedirected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null);
  const [b2bSuccessUrls, setB2bSuccessUrls] = useState<{ whatsapp: string } | null>(null);
  const [standardSuccessUrls, setStandardSuccessUrls] = useState<{ whatsapp: string } | null>(null);
  const [galleries, setGalleries] = useState<ImageGallery[]>([]);
  const [selectedStyleNumber, setSelectedStyleNumber] = useState<number | null>(null);
  const [customItemQuantity, setCustomItemQuantity] = useState<number>(1);
  const [sandwichFillingQuantities, setSandwichFillingQuantities] = useState<Record<string, number>>({});
  const [showNutritional, setShowNutritional] = useState(false);

  useEffect(() => {
    if (isCustomModalOpen || selectedProductForDetails) {
      const activeProd = selectedProductForDetails || selectedProductForCustom;
      const minQ = activeProd?.minQuantity && activeProd.minQuantity > 1 ? activeProd.minQuantity : 1;
      setCustomItemQuantity(minQ);
      setSandwichFillingQuantities({});
      setShowNutritional(false);
    }
  }, [isCustomModalOpen, selectedProductForDetails, selectedProductForCustom]);

  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    endereco: '',
    street: '',
    number: '',
    bairro: '',
    zipCode: '',
    city: '',
    state: '',
    aniversario: '',
    observacao: '',
    email: ''
  });

  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [deliveryCalculation, setDeliveryCalculation] = useState<DeliveryCalculation | null>(null);
  const [isCalculatingDelivery, setIsCalculatingDelivery] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);

  const handleCalculateDelivery = async (customFormData = formData) => {
    if (!settings.deliveryEnabled) return;
    
    let originLat = settings.deliveryOriginLat;
    let originLng = settings.deliveryOriginLng;

    if ((!originLat || !originLng) && settings.deliveryOriginAddress) {
      try {
        const originGeo = await geocodeAddress({ street: settings.deliveryOriginAddress });
        if (originGeo) {
          originLat = originGeo.lat;
          originLng = originGeo.lng;
        }
      } catch (e) {
        console.warn('Could not geocode origin address:', e);
      }
    }

    if (!originLat || !originLng) {
      if (settings.deliveryFallbackPrice !== undefined) {
        setDeliveryCalculation({
          fee: settings.deliveryFallbackPrice,
          isFree: settings.deliveryFallbackPrice === 0,
          isBeyondMax: false,
          distanceKm: 0,
          isEstimate: true
        });
      }
      return;
    }

    const street = customFormData.street?.trim();
    const number = customFormData.number?.trim();
    const neighborhood = customFormData.bairro?.trim();
    const city = customFormData.city?.trim();
    const state = customFormData.state?.trim();
    const cep = customFormData.zipCode?.trim();

    if (!street && !neighborhood && !cep) {
      return;
    }

    setIsCalculatingDelivery(true);
    try {
      const destGeo = await geocodeAddress({
        street,
        number,
        neighborhood,
        city,
        state,
        cep
      });

      if (!destGeo) {
        const fallback = settings.deliveryFallbackPrice ?? 0;
        setDeliveryCalculation({
          fee: fallback,
          isFree: fallback === 0,
          isBeyondMax: false,
          distanceKm: 0,
          isEstimate: true
        });
        toast.info('Não foi possível identificar a rota exata no mapa. Taxa de entrega padrão aplicada.');
        return;
      }

      const dist = await calculateDistanceKm(originLat, originLng, destGeo.lat, destGeo.lng);
      const calc = calculateDeliveryFee(dist.distanceKm, settings, cartTotal, dist.isEstimate);
      setDeliveryCalculation(calc);

      if (calc.isBeyondMax) {
        toast.warning(`A distância (${calc.distanceKm} km) ultrapassa nosso raio padrão de atendimento (${settings.deliveryMaxKm || 15} km).`);
      } else if (calc.isFree) {
        toast.success(`Parabéns! Frete Grátis aplicado (${calc.distanceKm} km)!`);
      } else {
        toast.success(`Frete calculado: ${currencySymbol} ${calc.fee.toFixed(2)} (${calc.distanceKm} km)`);
      }
    } catch (err) {
      console.warn('Delivery calculation error:', err);
      if (settings.deliveryFallbackPrice !== undefined) {
        setDeliveryCalculation({
          fee: settings.deliveryFallbackPrice,
          isFree: settings.deliveryFallbackPrice === 0,
          isBeyondMax: false,
          distanceKm: 0,
          isEstimate: true
        });
      }
    } finally {
      setIsCalculatingDelivery(false);
    }
  };

  const handleCepLookup = async (cepValue: string) => {
    const cleanCep = cepValue.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setIsSearchingCep(true);
      try {
        const address = await fetchViaCep(cleanCep);
        if (address) {
          const updated = {
            ...formData,
            zipCode: cepValue,
            street: address.logradouro || formData.street,
            bairro: address.bairro || formData.bairro,
            city: address.localidade || formData.city,
            state: address.uf || formData.state
          };
          setFormData(updated);
          toast.success('Endereço localizado pelo CEP!');
          if (settings.deliveryEnabled) {
            handleCalculateDelivery(updated);
          }
        }
      } catch (e) {
        console.warn('CEP lookup error:', e);
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  const [activeScreen, setActiveScreen] = useState<'intro' | 'selector' | 'menu'>(() => {
    if (settings.introEnabled !== false) return 'intro';
    return 'menu';
  });

  useEffect(() => {
    onScreenChange?.(activeScreen);
  }, [activeScreen, onScreenChange]);
  const [selectedCatalog, setSelectedCatalog] = useState<'catalog1' | 'catalog2' | 'catalog3' | 'catalog4' | null>('catalog1');

  useEffect(() => {
    if (settings) {
      if (settings.introEnabled === false) {
        setActiveScreen('menu');
      }
    }
  }, [settings]);

  useEffect(() => {
    if (selectedCatalog !== 'catalog1') {
      setSelectedCatalog('catalog1');
    }
  }, [selectedCatalog]);

  useEffect(() => {
    if (selectedProductForDetails) {
      const product = selectedProductForDetails;
      if (product.sizes && product.sizes.length > 0) {
        setSelectedSize(product.sizes[0]);
      } else {
        setSelectedSize(null);
      }

      if (product.isCustomCake) {
        setSelectedCakeSize('');
        setSelectedDough('');
        setSelectedFillings([]);
        setSelectedTopping('');
        setSelectedTopper('');
        setSelectedStyleNumber(null);
      }

      if (product.isCustomSandwich) {
        setSelectedSandwichFillings([]);
      }

      setMealSelections({
        removals: [],
        sides: []
      });
      setSideQuantities({});
    }
  }, [selectedProductForDetails]);

  useEffect(() => {
    console.log('Menu: Inicilizando listeners...');
    setLoading(true);
    
    const unsubProducts = onSnapshot(query(collection(db, 'produtos'), orderBy('title')), (snapshot) => {
      const fetchedProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(fetchedProducts.length > 0 ? fetchedProducts : BACKUP_PRODUCTS);
      setLoading(false);
    }, (error) => {
      console.warn('Menu: fallback ativo para produtos:', error?.message || error);
      setProducts((prev) => (prev.length > 0 ? prev : BACKUP_PRODUCTS));
      setLoading(false);
    });

    const unsubCategories = onSnapshot(query(collection(db, 'categorias'), orderBy('order', 'asc')), (snapshot) => {
      const fetchedCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setCategories(fetchedCategories.length > 0 ? fetchedCategories : BACKUP_CATEGORIES);
    }, (error) => {
      console.warn('Menu: fallback ativo para categorias:', error?.message || error);
      setCategories((prev) => (prev.length > 0 ? prev : BACKUP_CATEGORIES));
    });

    const unsubSides = onSnapshot(collection(db, 'acompanhamentos'), (snapshot) => {
      const fetchedSides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Side));
      setSides(fetchedSides);
    }, (error) => {
      console.warn('Menu: acompanhamentos indisponíveis:', error?.message || error);
    });

    const unsubGalleries = onSnapshot(collection(db, 'galerias'), (snapshot) => {
      setGalleries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ImageGallery)));
    }, (error) => {
      console.warn('Menu: galerias indisponíveis:', error?.message || error);
    });

    return () => {
      unsubProducts();
      unsubCategories();
      unsubSides();
      unsubGalleries();
    };
  }, []);

  // Instant 0ms Catalog Localization (EN / ES / PT) directly from Firestore fields — zero API calls on public screen
  const localizedCategories = useMemo(() => {
    return categories.map((cat) => ({
      ...cat,
      title: getLocalizedCategoryTitle(cat, activeLanguage),
    }));
  }, [categories, activeLanguage]);

  const localizedProducts = useMemo(() => {
    const catTitleMap = new Map(localizedCategories.map((c) => [c.id, c.title]));
    return products.map((prod) => {
      const translatedCatTitle = prod.categoryId ? catTitleMap.get(prod.categoryId) : undefined;
      return getLocalizedProduct(prod, activeLanguage, translatedCatTitle);
    });
  }, [products, activeLanguage, localizedCategories]);

  const localizedSides = useMemo(() => {
    return sides.map((s) => ({
      ...s,
      name: getLocalizedSideName(s, activeLanguage),
    }));
  }, [sides, activeLanguage]);

  // Check localStorage for saved B2B profile
  useEffect(() => {
    const saved = localStorage.getItem('b2b_profile_save');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.name) setB2bName(parsed.name);
        if (parsed.manager) setB2bResponsibleName(parsed.manager);
        if (parsed.phone) setB2bPhone(parsed.phone);
        if (parsed.address) setB2bAddress(parsed.address);
        setIsReturningB2b(true);
      } catch (e) {}
    }
  }, []);

  const getMaxFillingsForProduct = (product: Product, size: ProductSize | null): number => {
    if (size?.name) {
      const match = size.name.match(/(\d+)/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (parsed > 0) return parsed;
      }
    }
    return Math.max(1, product.maxFillings || 1);
  };

  const openProductModal = (product: Product) => {
    const minQ = product.minQuantity && product.minQuantity > 1 ? product.minQuantity : 1;
    setSelectedProductForDetails(product);
    setMealSelections({ removals: [], sides: [] });
    setSideQuantities({});
    setSelectedSandwichFillings([]);
    setSandwichFillingQuantities({});
    setCustomItemQuantity(minQ);

    if (product.hasSizes !== false && product.sizes && product.sizes.length > 0) {
      setSelectedSize(product.sizes[0]);
    } else {
      setSelectedSize(null);
    }

    if (product.isCustomCake) {
      setSelectedCakeSize('');
      setSelectedDough('');
      setSelectedFillings([]);
      setSelectedTopping('');
      setSelectedTopper('');
      setSelectedStyleNumber(null);
    }
  };

  const addToCart = (product: Product, customQty: number = 1) => {
    const minQ = product.minQuantity && product.minQuantity > 1 ? product.minQuantity : 1;
    const effectiveQty = Math.max(customQty, minQ);
    if (customQty < minQ) {
      toast.info(
        activeLanguage === 'es'
          ? `La cantidad mínima para "${product.title}" es de ${minQ} unidades.`
          : activeLanguage === 'pt'
            ? `A quantidade mínima para "${product.title}" é de ${minQ} unidades.`
            : `The minimum order quantity for "${product.title}" is ${minQ} units.`
      );
    }

    const requiresSelection = productRequiresCustomerSelection(product, sides);

    if (requiresSelection) {
      openProductModal(product);
      return;
    }

    setCart(prev => {
      const existing = prev.find(
        item =>
          item.productId === product.id &&
          !item.mealOptions &&
          !item.selectedSize &&
          !item.sandwichOptions &&
          !item.cakeOptions
      );
      if (existing) {
        return prev.map(item => item === existing ? { ...item, quantity: item.quantity + effectiveQty } : item);
      }
      return [...prev, { id: Math.random().toString(36).substr(2, 9), productId: product.id, quantity: effectiveQty }];
    });

    toast.success(
      activeLanguage === 'es'
        ? `¡${product.title} agregado!`
        : activeLanguage === 'pt'
          ? `${product.title} adicionado à sacola!`
          : `${product.title} added to bag!`
    );
  };

  const incrementSizeQty = (product: Product, size: ProductSize) => {
    const minQ = product.minQuantity && product.minQuantity > 1 ? product.minQuantity : 1;
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id && item.selectedSize?.id === size.id && !item.mealOptions && !item.cakeOptions);
      if (existing) {
        return prev.map(item => item === existing ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { id: Math.random().toString(36).substr(2, 9), productId: product.id, quantity: minQ, selectedSize: size }];
    });
  };

  const decrementSizeQty = (product: Product, size: ProductSize) => {
    const minQ = product.minQuantity && product.minQuantity > 1 ? product.minQuantity : 1;
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id && item.selectedSize?.id === size.id && !item.mealOptions && !item.cakeOptions);
      if (existing) {
        if (existing.quantity <= minQ) {
          if (minQ > 1) {
            toast.info(settings.language === 'en' 
              ? `Minimum quantity for "${product.title}" is ${minQ}. Item removed from cart.` 
              : `A quantidade mínima para "${product.title}" é de ${minQ} unidades. Item removido.`);
          }
          return prev.filter(item => item !== existing);
        }
        return prev.map(item => item === existing ? { ...item, quantity: item.quantity - 1 } : item);
      }
      return prev;
    });
  };

  const getMaxSandwichFillings = (sizeName: string): number => {
    const match = sizeName.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 1;
  };

  const addMealToCart = () => {
    if (!selectedProductForCustom) return;

    if (selectedProductForCustom.isCustomSandwich) {
      const activeFillings = (Object.entries(sandwichFillingQuantities) as [string, number][])
        .filter(([_, qty]) => qty > 0)
        .map(([name, qty]) => ({ name, qty }));

      if (activeFillings.length === 0) {
        toast.error(settings.language === 'en' ? 'Choose at least 1 option!' : 'Escolha pelo menos 1 opção!');
        return;
      }

      setCart(prev => {
        let currentCart = [...prev];

        for (const { name, qty } of activeFillings) {
          const newSandwichOptions = {
            fillings: [name]
          };

          const existing = currentCart.find(item =>
            item.productId === selectedProductForCustom.id &&
            ((!item.selectedSize && !selectedSize) || (item.selectedSize?.id === selectedSize?.id)) &&
            item.sandwichOptions &&
            JSON.stringify(item.sandwichOptions.fillings) === JSON.stringify(newSandwichOptions.fillings)
          );

          if (existing) {
            currentCart = currentCart.map(item =>
              item.id === existing.id ? { ...item, quantity: item.quantity + qty } : item
            );
          } else {
            currentCart.push({
              id: Math.random().toString(36).substr(2, 9),
              productId: selectedProductForCustom.id,
              quantity: qty,
              sandwichOptions: newSandwichOptions,
              selectedSize: selectedSize || undefined
            });
          }
        }

        return currentCart;
      });

      setIsCustomModalOpen(false);
      setSelectedProductForCustom(null);
      setSelectedSize(null);
      return;
    }

    if (selectedProductForCustom.isCustomCake) {
      const maxFillings = settings.cakeFillingsMax || 2;
      if (selectedFillings.length > maxFillings) {
        toast.error(`Choose at most ${maxFillings} fillings!`);
        return;
      }
      
      setCart(prev => {
        const newCakeOptions = {
          size: selectedCakeSize,
          dough: selectedDough,
          fillings: selectedFillings,
          topping: selectedTopping,
          topper: selectedTopper,
          styleNumber: selectedStyleNumber || undefined
        };
        
        const existing = prev.find(item => 
          item.productId === selectedProductForCustom.id && 
          item.cakeOptions &&
          item.cakeOptions.size === newCakeOptions.size &&
          item.cakeOptions.dough === newCakeOptions.dough &&
          item.cakeOptions.topping === newCakeOptions.topping &&
          item.cakeOptions.topper === newCakeOptions.topper &&
          item.cakeOptions.styleNumber === newCakeOptions.styleNumber &&
          JSON.stringify([...(item.cakeOptions.fillings || [])].sort()) === JSON.stringify([...newCakeOptions.fillings].sort())
        );

        if (existing) {
          return prev.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + customItemQuantity } : item);
        }

        return [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            productId: selectedProductForCustom.id,
            quantity: customItemQuantity,
            cakeOptions: newCakeOptions
          }
        ];
      });

      setIsCustomModalOpen(false);
      setSelectedProductForCustom(null);
      return;
    }
    
    const selectedSides: Side[] = [];
    Object.entries(sideQuantities).forEach(([id, qty]) => {
      const side = localizedSides.find(s => s.id === id);
      if (side) {
        for (let i = 0; i < (qty as number); i++) {
          selectedSides.push(side);
        }
      }
    });

    const newMealOptions = selectedProductForCustom.isMeal ? {
      removals: mealSelections.removals,
      sides: selectedSides
    } : undefined;

    setCart(prev => {
      const existing = prev.find(item => 
        item.productId === selectedProductForCustom.id && 
        ((!item.selectedSize && !selectedSize) || (item.selectedSize?.id === selectedSize?.id)) &&
        (!newMealOptions || (
          JSON.stringify([...(item.mealOptions?.removals || [])].sort()) === JSON.stringify([...newMealOptions.removals].sort()) &&
          JSON.stringify([...(item.mealOptions?.sides || [])].map(s => s.id).sort()) === JSON.stringify([...newMealOptions.sides].map(s => s.id).sort())
        ))
      );

      if (existing) {
        return prev.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + customItemQuantity } : item);
      }

      return [
        ...prev, 
        { 
          id: Math.random().toString(36).substr(2, 9), 
          productId: selectedProductForCustom.id, 
          quantity: customItemQuantity,
          mealOptions: newMealOptions,
          selectedSize: selectedSize || undefined
        }
      ];
    });

    setIsCustomModalOpen(false);
    setSelectedProductForCustom(null);
    setSelectedSize(null);
  };

  const addDetailedProductToCart = (product: Product) => {
    const fillingsAvailable = product.isCustomSandwich
      ? (product.customFillings || '')
          .split(',')
          .map(f => f.trim())
          .filter(Boolean)
      : [];
    const hasFillingsOpt = fillingsAvailable.length > 0;

    if (hasFillingsOpt && product.fillingsRequired !== false && selectedSandwichFillings.length === 0) {
      toast.error(
        activeLanguage === 'es'
          ? '¡Elige al menos 1 relleno!'
          : activeLanguage === 'pt'
            ? 'Escolha pelo menos 1 recheio!'
            : 'Please select at least 1 filling!'
      );
      return;
    }

    if (product.isCustomCake) {
      const maxFillings = settings.cakeFillingsMax || 2;
      if (selectedFillings.length > maxFillings) {
        toast.error(`Choose at most ${maxFillings} fillings!`);
        return;
      }
      
      setCart(prev => {
        const newCakeOptions = {
          size: selectedCakeSize,
          dough: selectedDough,
          fillings: selectedFillings,
          topping: selectedTopping,
          topper: selectedTopper,
          styleNumber: selectedStyleNumber || undefined
        };
        
        const existing = prev.find(item => 
          item.productId === product.id && 
          item.cakeOptions &&
          item.cakeOptions.size === newCakeOptions.size &&
          item.cakeOptions.dough === newCakeOptions.dough &&
          item.cakeOptions.topping === newCakeOptions.topping &&
          item.cakeOptions.topper === newCakeOptions.topper &&
          item.cakeOptions.styleNumber === newCakeOptions.styleNumber &&
          JSON.stringify([...(item.cakeOptions.fillings || [])].sort()) === JSON.stringify([...newCakeOptions.fillings].sort())
        );

        if (existing) {
          return prev.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + customItemQuantity } : item);
        }

        return [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            productId: product.id,
            quantity: customItemQuantity,
            cakeOptions: newCakeOptions
          }
        ];
      });

      setSelectedProductForDetails(null);
      toast.success(
        activeLanguage === 'es'
          ? '¡Agregado al pedido!'
          : activeLanguage === 'pt'
            ? 'Adicionado com sucesso ao pedido!'
            : 'Added to your order!'
      );
      return;
    }

    const selectedSides: Side[] = [];
    Object.entries(sideQuantities).forEach(([id, qty]) => {
      const side = localizedSides.find(s => s.id === id);
      if (side) {
        for (let i = 0; i < (qty as number); i++) {
          selectedSides.push(side);
        }
      }
    });

    const hasMealSelections = mealSelections.removals.length > 0 || selectedSides.length > 0;
    const newMealOptions =
      product.isMeal && hasMealSelections
        ? {
            removals: mealSelections.removals,
            sides: selectedSides,
          }
        : undefined;

    const newSandwichOptions =
      hasFillingsOpt && selectedSandwichFillings.length > 0
        ? {
            fillings: [...selectedSandwichFillings],
          }
        : undefined;

    const effectiveSize =
      product.hasSizes !== false && product.sizes && product.sizes.length > 0
        ? selectedSize || product.sizes[0]
        : undefined;

    setCart(prev => {
      const existing = prev.find(item => {
        if (item.productId !== product.id) return false;
        const sameSize = (!item.selectedSize && !effectiveSize) || item.selectedSize?.id === effectiveSize?.id;
        if (!sameSize) return false;

        const sameFillings =
          JSON.stringify([...(item.sandwichOptions?.fillings || [])].sort()) ===
          JSON.stringify([...(newSandwichOptions?.fillings || [])].sort());
        if (!sameFillings) return false;

        const sameRemovals =
          JSON.stringify([...(item.mealOptions?.removals || [])].sort()) ===
          JSON.stringify([...(newMealOptions?.removals || [])].sort());
        const sameSides =
          JSON.stringify([...(item.mealOptions?.sides || [])].map(s => s.id).sort()) ===
          JSON.stringify([...(newMealOptions?.sides || [])].map(s => s.id).sort());
        return sameRemovals && sameSides;
      });

      if (existing) {
        return prev.map(item =>
          item.id === existing.id ? { ...item, quantity: item.quantity + customItemQuantity } : item
        );
      }

      return [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          productId: product.id,
          quantity: customItemQuantity,
          mealOptions: newMealOptions,
          sandwichOptions: newSandwichOptions,
          selectedSize: effectiveSize,
        },
      ];
    });

    setSelectedProductForDetails(null);
    setSelectedSize(null);
    setSelectedSandwichFillings([]);
    setMealSelections({ removals: [], sides: [] });
    setSideQuantities({});
    toast.success(
      activeLanguage === 'es'
        ? '¡Agregado al pedido!'
        : activeLanguage === 'pt'
          ? 'Adicionado com sucesso ao pedido!'
          : 'Added to your order!'
    );
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === cartItemId);
      if (!existing) return prev;
      const product = products.find(p => p.id === existing.productId);
      const minQ = product?.minQuantity && product.minQuantity > 1 ? product.minQuantity : 1;
      if (existing.quantity > minQ) {
        return prev.map(item => item.id === cartItemId ? { ...item, quantity: item.quantity - 1 } : item);
      }
      if (minQ > 1) {
        toast.info(settings.language === 'en' 
          ? `Minimum order quantity for this item is ${minQ}. Item removed from cart.` 
          : `A quantidade mínima para este item é de ${minQ} unidades. Item removido.`);
      }
      return prev.filter(item => item.id !== cartItemId);
    });
  };

  const cartItemsCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => {
    const product = products.find(p => p.id === item.productId);
    const basePrice = item.selectedSize ? item.selectedSize.price : ((product?.price && product.price > 0) ? product.price : (product?.oldPrice || 0));
    let itemPrice = basePrice;
    if (item.mealOptions?.sides) {
      itemPrice += item.mealOptions.sides.reduce((sum, s) => sum + s.price, 0);
    }
    return total + itemPrice * item.quantity;
  }, 0);

  const checkMarmitifyLimit = () => {
    return true;
  };

  const handleFullKioskReset = useCallback(() => {
    setCart([]);
    setIsModalOpen(false);
    setIsCustomModalOpen(false);
    setSelectedProductForCustom(null);
    setSelectedProductForDetails(null);
    setIsDietsModalOpen(false);
    setCheckoutStep('summary');
    setGuestLanguage(null);
    setActiveScreen(initialSettings?.introEnabled !== false ? 'intro' : 'menu');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [initialSettings?.introEnabled]);

  const validateCartItems = () => {
    if (settings.minOrderEnabled && settings.minOrderValue && settings.minOrderValue > 0) {
      if (cartTotal < settings.minOrderValue) {
        const diff = settings.minOrderValue - cartTotal;
        const formattedMin = formatMoney(settings.minOrderValue, settings.currency);
        const formattedDiff = formatMoney(diff, settings.currency);
        return {
          isValid: false,
          isMinOrder: true,
          message:
            activeLanguage === 'pt'
              ? `Valor mínimo do pedido: ${formattedMin}. Faltam ${formattedDiff} para continuar.`
              : activeLanguage === 'es'
                ? `Pedido mínimo: ${formattedMin}. Faltan ${formattedDiff} para continuar.`
                : `Minimum order: ${formattedMin}. Add ${formattedDiff} more to continue.`
        };
      }
    }

    for (const item of cart) {
      const product = products.find(p => p.id === item.productId);
      if (product && product.minQuantity && product.minQuantity > 1) {
        if (item.quantity < product.minQuantity) {
          return {
            isValid: false,
            message:
              activeLanguage === 'pt'
                ? `O item "${product.title}" exige quantidade mínima de ${product.minQuantity} unidades (atual: ${item.quantity}).`
                : activeLanguage === 'es'
                  ? `El artículo "${product.title}" requiere un mínimo de ${product.minQuantity} unidades (actual: ${item.quantity}).`
                  : `"${product.title}" requires a minimum quantity of ${product.minQuantity} (current: ${item.quantity}).`
          };
        }
      }
    }
    return { isValid: true, message: '' };
  };

  const handleFinalizar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (cart.length === 0) {
      toast.error(settings.language === 'en' ? 'Your cart is empty!' : 'Seu carrinho está vazio!');
      return;
    }

    // Validações de campos obrigatórios e formato de e-mail/telefone
    if (!formData.nome.trim()) {
      toast.error('O campo Nome Completo é obrigatório!');
      return;
    }
    if (!formData.telefone.trim()) {
      toast.error('O campo Telefone é obrigatório!');
      return;
    }
    const countryCfg = COUNTRY_OPTIONS[settings.whatsappCountryCode || '+55'] || COUNTRY_OPTIONS['+55'];
    const phoneDigits = formData.telefone.replace(/\D/g, '');
    if (phoneDigits.length < countryCfg.minDigits) {
      toast.error(`Por favor, insira um telefone válido com código de área (${countryCfg.minDigits} dígitos)!`);
      return;
    }
    if (!formData.aniversario.trim()) {
      toast.error('O campo Aniversário é obrigatório!');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(formData.aniversario.trim())) {
      toast.error(activeLanguage === 'en' ? 'Please enter birthday as MM/DD!' : activeLanguage === 'es' ? 'Por favor ingrese el cumpleaños como MM/DD!' : 'Por favor, insira o aniversário no formato MM/DD!');
      return;
    }
    if (!formData.email.trim()) {
      toast.error('O campo E-mail é obrigatório!');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      toast.error('Por favor, insira um e-mail válido!');
      return;
    }
    if (deliveryType === 'delivery' || !settings.deliveryEnabled) {
      if (!formData.street.trim()) {
        toast.error('O campo Rua/Avenida é obrigatório!');
        return;
      }
      if (!formData.city.trim()) {
        toast.error('O campo Cidade é obrigatório!');
        return;
      }
      if (!formData.state.trim()) {
        toast.error('O campo Estado é obrigatório!');
        return;
      }
    }

    const validation = validateCartItems();
    if (!validation.isValid) {
      toast.error(validation.message);
      return;
    }
    
    if (!checkMarmitifyLimit()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const hasConsultItems = cart.some(item => {
        const p = products.find(prod => prod.id === item.productId);
        return p?.priceType === 'consult' || p?.isCustomCake === true;
      });
      
      const orderItems = cart.map(item => {
        const product = products.find(p => p.id === item.productId)!;
        const basePrice = item.selectedSize ? item.selectedSize.price : ((product.price && product.price > 0) ? product.price : (product.oldPrice || 0));
        let itemPrice = basePrice;
        if (item.mealOptions?.sides) {
          itemPrice += item.mealOptions.sides.reduce((sum, s) => sum + s.price, 0);
        }

        const cleanedMealOptions = item.mealOptions ? {
          removals: item.mealOptions.removals || [],
          sides: (item.mealOptions.sides || []).map(side => ({
            id: side.id,
            name: side.name,
            price: side.price,
            type: side.type || 'side'
          }))
        } : undefined;

        return {
          title: item.selectedSize ? `${product.title} (${item.selectedSize.name})` : product.title,
          quantity: item.quantity,
          price: itemPrice,
          priceType: product.priceType || 'fixed',
          mealOptions: cleanedMealOptions,
          selectedSize: item.selectedSize || undefined,
          cakeOptions: item.cakeOptions || undefined,
          sandwichOptions: item.sandwichOptions || undefined
        };
      });

      const deliveryFeeVal = (settings.deliveryEnabled && deliveryType === 'delivery')
        ? (deliveryCalculation?.fee || 0)
        : 0;
      const finalTotalWithDelivery = cartTotal + deliveryFeeVal;

      const fullAddress = deliveryType === 'pickup'
        ? (settings.deliveryOriginAddress ? `Retirada na Loja (${settings.deliveryOriginAddress})` : 'Retirada no Estabelecimento')
        : `${formData.street}, ${formData.number || 'S/N'}${formData.bairro ? ` - Bairro ${formData.bairro}` : ''} - ${formData.city} / ${formData.state}${formData.zipCode ? ` (CEP: ${formData.zipCode})` : ''}`;

      const orderData: Omit<Order, 'id'> = cleanFirestoreObject({
        customerName: formData.nome,
        phone: formData.telefone,
        address: fullAddress,
        street: formData.street || '',
        number: formData.number || '',
        neighborhood: formData.bairro || '',
        zipCode: formData.zipCode || '',
        city: formData.city || '',
        state: formData.state || '',
        deliveryType: settings.deliveryEnabled ? deliveryType : 'pickup',
        deliveryFee: (settings.deliveryEnabled && deliveryType === 'delivery') ? deliveryFeeVal : 0,
        deliveryDistanceKm: (settings.deliveryEnabled && deliveryType === 'delivery') ? (deliveryCalculation?.distanceKm || 0) : 0,
        birthday: formData.aniversario || '',
        observation: formData.observacao || '',
        email: formData.email || '',
        items: orderItems,
        total: finalTotalWithDelivery,
        subtotal: cartTotal,
        taxRate: 0,
        taxAmount: 0,
        createdAt: serverTimestamp(),
        orderLanguage: settings.language || 'pt'
      });

      console.log('Finalizando pedido...', orderData);
      await addDoc(collection(db, 'pedidos'), orderData);
      
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

      let message = `*${t.whatsappOrder} - ${settings.brandName || settings.slug}*\n`;
      message += `*${t.whatsappDate}:* ${dateStr} ${t.whatsappAt} ${timeStr}\n\n`;
      
      message += `*--- ${t.whatsappData} ---*\n`;
      message += `*${t.fullName}:* ${formData.nome}\n`;
      message += `*${t.phone}:* ${formData.telefone}\n`;
      message += `*${t.email}:* ${formData.email}\n`;
      message += `*${t.birthday}:* ${formData.aniversario}\n`;
      if (settings.deliveryEnabled) {
        message += `*Forma de Recebimento:* ${deliveryType === 'pickup' ? '🏪 Retirada no Estabelecimento' : '🚚 Entrega (Delivery)'}\n`;
      }
      if (deliveryType === 'delivery' || !settings.deliveryEnabled) {
        message += `*${t.street}:* ${formData.street}\n`;
        message += `*${t.number}:* ${formData.number || '-'}\n`;
        if (formData.bairro) message += `*Bairro:* ${formData.bairro}\n`;
        message += `*${t.city}:* ${formData.city}\n`;
        message += `*${t.state}:* ${formData.state}\n`;
        if (formData.zipCode) message += `*CEP:* ${formData.zipCode}\n`;
      } else if (deliveryType === 'pickup' && settings.deliveryOriginAddress) {
        message += `*Local de Retirada:* ${settings.deliveryOriginAddress}\n`;
      }
      if (settings.deliveryEnabled && deliveryType === 'delivery' && deliveryCalculation?.distanceKm) {
        message += `*Distância Estimada:* ${deliveryCalculation.distanceKm} km (via OpenStreetMap/OSRM)\n`;
      }
      message += `*${t.observation}:* ${formData.observacao || '-'}\n\n`;

      message += `*--- ${t.whatsappItems} ---*\n`;
      orderItems.forEach((item, idx) => {
        const originalItem = cart[idx];
        if (item.priceType === 'consult') {
          message += `• ${item.quantity}x ${item.title} - (Value to Consult)\n`;
        } else {
          message += `• ${item.quantity}x ${item.title} - ${currencySymbol}${(item.price * item.quantity).toFixed(2)}\n`;
        }
        if (item.mealOptions) {
          if (item.mealOptions.removals.length > 0) {
            message += `  (Excluding: ${item.mealOptions.removals.join(', ')})\n`;
          }
          if (item.mealOptions.sides.length > 0) {
            const normalSidesArr = item.mealOptions.sides.filter(s => s.type !== 'swap');
            const swapSidesArr = item.mealOptions.sides.filter(s => s.type === 'swap');
            
            if (normalSidesArr.length > 0) {
              const grouped = normalSidesArr.reduce((acc: Record<string, number>, s) => { acc[s.name] = (acc[s.name] || 0) + 1; return acc; }, {});
              const str = Object.entries(grouped).map(([name, qty]) => `${name}${Number(qty) > 1 ? ` (${qty}x)` : ''}`).join(', ');
              message += `  (Sides: ${str})\n`;
            }
            if (swapSidesArr.length > 0) {
              const grouped = swapSidesArr.reduce((acc: Record<string, number>, s) => { acc[s.name] = (acc[s.name] || 0) + 1; return acc; }, {});
              const str = Object.entries(grouped).map(([name, qty]) => `${name}${Number(qty) > 1 ? ` (${qty}x)` : ''}`).join(', ');
              message += `  (Swaps: ${str})\n`;
            }
          }
        }
        if (originalItem && originalItem.cakeOptions) {
          const opts = originalItem.cakeOptions;
          if (opts.size) message += `  (Size: ${opts.size})\n`;
          if (opts.dough) message += `  (Dough: ${opts.dough})\n`;
          if (opts.fillings && opts.fillings.length > 0) message += `  (Fillings: ${opts.fillings.join(' + ')})\n`;
          if (opts.topping) message += `  (Topping: ${opts.topping})\n`;
          if (opts.topper) message += `  (Topper: ${opts.topper})\n`;
          if (opts.styleNumber) message += `  (Style Reference: Photo No. ${opts.styleNumber})\n`;
        }
        if (originalItem && originalItem.sandwichOptions) {
          const opts = originalItem.sandwichOptions;
          if (opts.fillings && opts.fillings.length > 0) message += `  (${settings.language === 'en' ? 'State' : 'Estado'}: ${opts.fillings.join(' + ')})\n`;
        }
      });

      if (settings.deliveryEnabled && deliveryType === 'delivery') {
        message += `\n*Subtotal dos Itens:* ${currencySymbol}${cartTotal.toFixed(2)}\n`;
        message += `*Taxa de Entrega (${deliveryCalculation?.distanceKm ? `${deliveryCalculation.distanceKm} km` : 'Frete'}):* ${deliveryCalculation?.isFree ? 'GRÁTIS' : `${currencySymbol}${deliveryFeeVal.toFixed(2)}`}\n`;
      } else if (settings.deliveryEnabled && deliveryType === 'pickup') {
        message += `\n*Subtotal dos Itens:* ${currencySymbol}${cartTotal.toFixed(2)}\n`;
        message += `*Retirada no Estabelecimento:* GRÁTIS\n`;
      }

      message += `*${t.whatsappTotal}:* ${currencySymbol}${finalTotalWithDelivery.toFixed(2)}\n`;
      
      if (hasConsultItems) {
        message += `\n⚠️ *${t.consultMessage}*\n`;
      }
      
      message += `\n${settings.whatsappClosingMessage || 'Obrigada pelo pedido, aguarde que entraremos em contato para confirmação!'}`;

      const encodedMessage = encodeURIComponent(message);
      const cleanPhone = getCleanWhatsAppPhone(settings.whatsappNumber || '', settings.whatsappCountryCode || '+55');
      
      if (!cleanPhone) {
        toast.error(settings.language === 'en' 
          ? 'Error: Representative contact number is not properly configured in the administration panel.' 
          : 'Erro: Número para contato não configurado corretamente no painel administrativo.'
        );
        return;
      }

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const whatsappUrl = isIOS 
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`
        : `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

      setStandardSuccessUrls({ whatsapp: whatsappUrl });
      setCheckoutStep('channels');
      setHasRedirected(false);
      toast.success(settings.language === 'en' ? 'Order saved! Select your dispatch method below.' : 'Pedido salvo! Selecione a forma de envio abaixo.');
    } catch (error) {
      console.error("Erro ao salvar pedido:", error);
      toast.error(settings.language === 'en' ? 'Error finalizing order. Please try again.' : 'Erro ao finalizar pedido. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteStandardOrder = () => {
    setCart([]);
    setIsModalOpen(false);
    setCheckoutStep('summary');
    setStandardSuccessUrls(null);
    setFormData({ 
      nome: '', 
      telefone: '', 
      endereco: '', 
      street: '',
      number: '',
      bairro: '',
      zipCode: '',
      state: '',
      city: '',
      aniversario: '', 
      observacao: '', 
      email: '' 
    });
    setDeliveryCalculation(null);
  };

  const handleCompleteB2bOrder = () => {
    setCart([]);
    setIsModalOpen(false);
    setCheckoutStep('summary');
    setB2bSuccessUrls(null);
  };

   const handleFinalizarB2b = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (cart.length === 0) {
      toast.error(settings.language === 'en' ? 'Your cart is empty!' : 'Seu carrinho está vazio!');
      return;
    }

    const validation = validateCartItems();
    if (!validation.isValid) {
      toast.error(validation.message);
      return;
    }

    if (!b2bName.trim() || !b2bResponsibleName.trim() || !b2bPhone.trim() || !b2bAddress.trim() || !b2bZipCode.trim() || !b2bCity.trim() || !b2bDate) {
      toast.error('Please fill in all required fields!');
      return;
    }

    const orderItems = cart.map(item => {
      const product = products.find(p => p.id === item.productId)!;
      let titleStr = item.selectedSize ? `${product.title} (${item.selectedSize.name})` : product.title;
      if (item.cakeOptions) {
        const parts = [];
        if (item.cakeOptions.size) parts.push(`Size: ${item.cakeOptions.size}`);
        if (item.cakeOptions.dough) parts.push(`Dough: ${item.cakeOptions.dough}`);
        if (item.cakeOptions.fillings && item.cakeOptions.fillings.length > 0) parts.push(`Fillings: ${item.cakeOptions.fillings.join(' + ')}`);
        if (item.cakeOptions.topping) parts.push(`Topping: ${item.cakeOptions.topping}`);
        if (item.cakeOptions.topper) parts.push(`Topper: ${item.cakeOptions.topper}`);
        if (item.cakeOptions.styleNumber) parts.push(`Estilo nº ${item.cakeOptions.styleNumber}`);
        titleStr += ` [${parts.join(', ')}]`;
      }
      if (item.sandwichOptions) {
        const parts = [];
        if (item.sandwichOptions.fillings && item.sandwichOptions.fillings.length > 0) parts.push(`${activeLanguage === 'es' ? 'Rellenos' : activeLanguage === 'pt' ? 'Recheios' : 'Fillings'}: ${item.sandwichOptions.fillings.join(' + ')}`);
        titleStr += ` [${parts.join(', ')}]`;
      }
      return {
        title: titleStr,
        quantity: item.quantity,
        price: 0,
        priceType: 'consult'
      };
    });

    const b2bOrderObj = {
      customerName: b2bName,
      phone: b2bPhone,
      address: b2bAddress,
      zipCode: b2bZipCode,
      city: b2bCity,
      pickupDate: b2bDate ? (() => {
        const [year, month, day] = b2bDate.split('-');
        return `${month}/${day}/${year}`;
      })() : '',
      birthday: '',
      observation: b2bObservation,
      email: '',
      items: orderItems,
      total: 0,
      createdAt: serverTimestamp(),
      orderLanguage: 'en',
      isB2B: true,
      isPJ: true,
      b2bManagerName: b2bResponsibleName,
      b2bFrequency: b2bFrequency,
      b2bCompanyName: b2bName,
      b2bAddress: b2bAddress,
      b2bZipCode: b2bZipCode,
      b2bCity: b2bCity
    };

    try {
      console.log('Sending corporate B2B order request...', b2bOrderObj);
      await addDoc(collection(db, 'pedidos'), b2bOrderObj);
      
      // Persist client details in localStorage so it autofills on subsequent visits!
      localStorage.setItem('b2b_profile_save', JSON.stringify({
        name: b2bName,
        manager: b2bResponsibleName,
        phone: b2bPhone,
        address: b2bAddress,
        zipCode: b2bZipCode,
        city: b2bCity
      }));
      setIsReturningB2b(true);

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

      let message = `*Corporate Order Request - ${settings.brandName || settings.slug}*\n`;
      message += `*Date:* ${dateStr} at ${timeStr}\n\n`;
      message += `*--- COMPANY DETAILS ---*\n`;
      message += `*Company Name:* ${b2bName}\n`;
      message += `*Contact Manager:* ${b2bResponsibleName}\n`;
      message += `*Phone:* ${b2bPhone}\n`;
      message += `*Delivery Address:* ${b2bAddress}\n`;
      message += `*Zip Code:* ${b2bZipCode}\n`;
      message += `*City:* ${b2bCity}\n`;
      message += `*Frequency:* ${b2bFrequency === 'weekly' ? 'Weekly Contract (Recurring)' : 'One-Time Order (Spot)'}\n`;
      message += `*Target Start Date:* ${b2bOrderObj.pickupDate}\n`;
      if (b2bObservation) {
        message += `*Notes:* ${b2bObservation}\n`;
      }
      message += `\n*--- ORDERED ITEMS ---*\n`;
      orderItems.forEach(item => {
        message += `• ${item.quantity}x ${item.title}\n`;
      });
      message += `\n${settings.whatsappClosingMessage || 'Obrigada pelo pedido, aguarde que entraremos em contato para confirmação!'}\n`;
      
      const encodedMessage = encodeURIComponent(message);
      const cleanPhone = getCleanWhatsAppPhone(settings.whatsappNumber || '', settings.whatsappCountryCode || '+55');

      if (!cleanPhone) {
        toast.error('Representative contact number is not fully configured in the Admin panel.');
        return;
      }

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const whatsappUrl = isIOS 
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`
        : `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

      // Save URLs and go to success channels page
      setB2bSuccessUrls({ whatsapp: whatsappUrl });
      setCheckoutStep('b2b_channels');
      setHasRedirected(false);
      toast.success('Corporate order saved! Choose how you would like to submit below.');
    } catch (error) {
      console.error('Error saving B2B corporate order details:', error);
      toast.error('Failed to submit corporate request. Please verify and try again.');
    }
  };

  const inactivityActive =
    !isMobilePickup &&
    (activeScreen !== 'intro' ||
      cart.length > 0 ||
      isModalOpen ||
      isCustomModalOpen ||
      !!selectedProductForDetails);

  if (activeScreen === 'intro') {
    const langKey = activeLanguage; // 'en' | 'es' | 'pt'

    const rawIntroButton = (settings.introButtonText || '').trim();
    const localizedBtn =
      langKey === 'es'
        ? settings.introButtonText_es
        : langKey === 'pt'
          ? settings.introButtonText_pt
          : settings.introButtonText_en;
    const isDefaultButton =
      !rawIntroButton ||
      /^(ACESSAR NOSSO CARD|INICIAR|TAP TO START ORDER|TAP TO ORDER|TOCAR PARA ORDENAR|TOQUE PARA PEDIR)/i.test(rawIntroButton);
    const displayIntroButton =
      (localizedBtn && localizedBtn.trim()) ||
      (isDefaultButton ? k.startOrder : rawIntroButton);

    const rawIntroBottom = (settings.introBottomText || '').trim();
    const localizedBottom =
      langKey === 'es'
        ? settings.introBottomText_es
        : langKey === 'pt'
          ? settings.introBottomText_pt
          : settings.introBottomText_en;
    const isDefaultBottom =
      !rawIntroBottom ||
      /TECNOLOGIA PARA O SEU NEG|CURSOS DE|EASY TOTEM|EASY KIOSKI|SELF-SERVICE KIOSK|KIOSCO DE AUTOSERVICIO|TOTEM DE AUTOATENDIMENTO/i.test(rawIntroBottom);
    const displayIntroBottom = isMobilePickup
      ? k.mobilePickupIntroBottom
      : (localizedBottom && localizedBottom.trim()) ||
        (isDefaultBottom ? k.introDefaultBottom : rawIntroBottom);

    const rawIntroSubtitle = (settings.introSubtitle || '').trim();
    const localizedSub =
      langKey === 'es'
        ? settings.introSubtitle_es
        : langKey === 'pt'
          ? settings.introSubtitle_pt
          : settings.introSubtitle_en;
    const isDefaultSubtitle =
      !rawIntroSubtitle ||
      /Cardápio Especial|Aprenda Gastronomia|Artisanal Self-Service|Self-Service Kiosk|Autoservicio|Autoatendimento/i.test(rawIntroSubtitle);
    const mobileDefaultSubtitle =
      langKey === 'es'
        ? 'Retiro Móvil'
        : langKey === 'pt'
          ? 'Retirada Mobile'
          : 'Mobile Pickup';
    const displayIntroSubtitle = isMobilePickup
      ? (localizedSub && localizedSub.trim()) ||
        (rawIntroSubtitle && !isDefaultSubtitle ? rawIntroSubtitle : mobileDefaultSubtitle)
      : (localizedSub && localizedSub.trim()) ||
        (isDefaultSubtitle ? k.introDefaultSubtitle : rawIntroSubtitle);

    const rawIntroDesc = (settings.introDescription || '').trim();
    const localizedDesc =
      langKey === 'es'
        ? settings.introDescription_es
        : langKey === 'pt'
          ? settings.introDescription_pt
          : settings.introDescription_en;
    const isDefaultDesc =
      !rawIntroDesc ||
      /Explore our handcrafted menu|Browse our artisan menu|Explora nuestro menú artesanal|Explore nosso cardápio artesanal/i.test(rawIntroDesc);
    const displayIntroDescription =
      (localizedDesc && localizedDesc.trim()) ||
      (isDefaultDesc ? k.introDefaultDescription : rawIntroDesc);

    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-screen p-4 pt-16 sm:pt-4 select-none relative">
        {isMobilePickup && (
          <div className="w-full max-w-sm mb-3">
            <PwaInstallBanner settings={settings} language={activeLanguage} />
          </div>
        )}
        {/* Discreet EN | ES | PT Language Switcher on Intro Screen */}
        <div className="fixed top-4 right-4 z-40 flex flex-col items-end gap-2">
          <div
            className="flex items-center gap-1 rounded-full backdrop-blur-md p-1 border shadow-sm"
            style={{
              backgroundColor: theme.pillBg,
              borderColor: theme.primaryBorder,
            }}
          >
            {(['en', 'es', 'pt'] as KioskLanguage[]).map((lang) => {
              const isSelected = activeLanguage === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setGuestLanguage(lang)}
                  className={`${isMobilePickup ? 'min-h-[34px] px-3 text-[11px]' : 'min-h-[42px] px-4 text-xs'} rounded-full font-black tracking-widest uppercase transition-all cursor-pointer`}
                  style={{
                    backgroundColor: isSelected ? theme.primary : 'transparent',
                    color: isSelected ? theme.primaryContrast : theme.text,
                  }}
                >
                  {lang.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`glass w-full border shadow-2xl flex flex-col items-center text-center ${
            isMobilePickup
              ? 'max-w-sm rounded-3xl p-6 sm:p-8 space-y-6 sm:space-y-8'
              : 'max-w-xl sm:max-w-2xl rounded-[40px] p-8 sm:p-12 space-y-8 sm:space-y-10'
          }`}
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.primaryBorder,
            color: theme.text,
          }}
        >
          {/* Logo Frame — 5 rapid taps open Secret Admin/KDS modal (Totem mode only) */}
          <div className="relative mt-2">
            <div 
              onClick={handleLogoTap}
              className={`${
                isMobilePickup
                  ? 'w-[152px] h-[152px]'
                  : 'w-[188px] h-[188px] sm:w-[224px] sm:h-[224px]'
              } rounded-full p-1.5 shadow-md flex items-center justify-center overflow-hidden border-2 cursor-default`}
              style={{ borderColor: theme.primary, backgroundColor: theme.cardBgSolid }}
            >
              <img 
                src={settings.logo} 
                alt="Logo" 
                className="w-full h-full object-cover rounded-full pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          {/* Texts Section */}
          <div className="space-y-3 sm:space-y-4">
            <h1
              className={`${
                isMobilePickup ? 'text-3xl' : 'text-4xl sm:text-5xl'
              } font-serif font-bold tracking-tight`}
              style={{ color: theme.brandText }}
            >
              {renderTitle(settings.introTitle || settings.brandName || 'Easy Kioski')}
            </h1>
            
            <div className="flex items-center justify-center gap-3 py-1">
              <div className={`h-[1px] ${isMobilePickup ? 'w-12' : 'w-16'}`} style={{ backgroundColor: theme.primaryBorderStrong }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
              <div className={`h-[1px] ${isMobilePickup ? 'w-12' : 'w-16'}`} style={{ backgroundColor: theme.primaryBorderStrong }} />
            </div>

            <p
              className={`${
                isMobilePickup ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
              } font-script font-normal py-0.5`}
              style={{ color: theme.text }}
            >
              {displayIntroSubtitle}
            </p>
            
            <p
              className={`${
                isMobilePickup ? 'text-sm max-w-xs' : 'text-base sm:text-lg max-w-md'
              } font-medium italic mx-auto`}
              style={{ color: theme.textMuted }}
            >
              {displayIntroDescription}
            </p>
          </div>

          {/* CTA Button */}
          <div className={`w-full pt-2 space-y-3 ${isMobilePickup ? '' : 'max-w-md'}`}>
            <button
              onClick={() => {
                setActiveScreen('menu');
              }}
              className={`w-full ${
                isMobilePickup
                  ? 'min-h-[56px] py-4 px-6 text-sm'
                  : 'min-h-[68px] py-5 px-8 text-base sm:text-lg'
              } rounded-full font-bold tracking-widest uppercase shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer`}
              style={{ backgroundColor: theme.primary, color: theme.primaryContrast }}
            >
              {displayIntroButton}
            </button>
            
            <p
              className={`${
                isMobilePickup ? 'text-[10px]' : 'text-xs'
              } font-mono font-bold tracking-widest uppercase pt-1`}
              style={{ color: theme.textMuted }}
            >
              {displayIntroBottom}
            </p>
          </div>
        </motion.div>

        <InactivityGuard
          enabled={inactivityActive}
          timeoutSeconds={settings.kioskInactivitySeconds || 45}
          countdownSeconds={10}
          primaryColor={settings.primaryColor}
          glassColor={settings.glassColor}
          textColor={settings.textColor}
          language={activeLanguage}
          onResetKiosk={handleFullKioskReset}
        />
      </div>
    );
  }

  if (activeScreen === 'selector') {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-screen p-4 select-none">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="w-full max-w-[605px] flex flex-col items-center space-y-4 sm:space-y-6 py-2 sm:py-6"
        >
          {/* Circular Header Logo — 5 rapid taps open Secret Admin/KDS modal */}
          <div 
            onClick={handleLogoTap}
            className="w-[166px] h-[166px] sm:w-[229px] sm:h-[229px] rounded-full p-1 flex items-center justify-center overflow-hidden border-2 flex-shrink-0 cursor-default"
            style={{ borderColor: settings.primaryColor }}
          >
            <img 
              src={settings.logo} 
              alt="Logo" 
              className="w-full h-full object-cover rounded-full bg-white pointer-events-none"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-4xl font-serif font-bold tracking-tight text-center" style={{ color: theme.brandText }}>
              {settings.selectorTitle || settings.brandName || 'Easy Byz Gastronomy'}
            </h2>
            <p className="text-xs font-bold tracking-wide uppercase opacity-90 text-center" style={{ color: theme.categoryText }}>
              {settings.selectorSubtitle || k.chooseExperience}
            </p>
          </div>

          {/* Cards Grid - Lado a Lado na vertical e horizontal */}
          <div className="grid grid-cols-2 gap-3.5 w-full mt-4 sm:mt-6">
            {/* Card 1 */}
            {settings.catalog1Active !== false && (
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedCatalog('catalog1');
                  setActiveScreen('menu');
                }}
                className="backdrop-blur-lg rounded-2xl p-2.5 flex flex-col items-center cursor-pointer text-center group border shadow-md justify-between"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.primaryBorder }}
              >
                <div className="w-full aspect-square rounded-xl overflow-hidden shadow-inner" style={{ backgroundColor: theme.primaryTint05 }}>
                  <img 
                    src={settings.catalog1Image || 'https://i.ibb.co/X0vYy7L/cakes.png'} 
                    alt="Catalog 1" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="mt-2.5 space-y-1 w-full flex-grow flex flex-col justify-start">
                  <h3 className="text-xs sm:text-sm font-serif font-black uppercase tracking-wide transition-colors leading-tight" style={{ color: theme.text }}>
                    {(activeLanguage === 'es'
                      ? settings.catalog1Title_es
                      : activeLanguage === 'pt'
                        ? settings.catalog1Title_pt
                        : settings.catalog1Title_en)?.trim() || settings.catalog1Title || 'Acarajé & Pratos'}
                  </h3>
                  {(() => {
                    const localizedCatalog1Desc =
                      (activeLanguage === 'es'
                        ? settings.catalog1Desc_es
                        : activeLanguage === 'pt'
                          ? settings.catalog1Desc_pt
                          : settings.catalog1Desc_en)?.trim() || settings.catalog1Desc;
                    return localizedCatalog1Desc ? (
                      <p className="text-[10px] font-semibold leading-tight px-1 block line-clamp-2" style={{ color: theme.textMuted }}>
                        {localizedCatalog1Desc}
                      </p>
                    ) : null;
                  })()}
                </div>
              </motion.div>
            )}

            {/* Card 2 */}
            {settings.catalog2Active !== false && (
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedCatalog('catalog2');
                  setActiveScreen('menu');
                }}
                className="backdrop-blur-lg rounded-2xl p-2.5 flex flex-col items-center cursor-pointer text-center group border shadow-md justify-between"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.primaryBorder }}
              >
                <div className="w-full aspect-square rounded-xl overflow-hidden shadow-inner" style={{ backgroundColor: theme.primaryTint05 }}>
                  <img 
                    src={settings.catalog2Image || 'https://i.ibb.co/X0vYy7L/cakes.png'} 
                    alt="Catalog 2" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="mt-2.5 space-y-1 w-full flex-grow flex flex-col justify-start">
                  <h3 className="text-xs sm:text-sm font-serif font-black uppercase tracking-wide transition-colors leading-tight" style={{ color: theme.text }}>
                    {settings.catalog2Title || 'Bebidas & Sobremesas'}
                  </h3>
                  {settings.catalog2Desc && (
                    <p className="text-[10px] font-semibold leading-tight px-1 block line-clamp-2" style={{ color: theme.textMuted }}>
                       {settings.catalog2Desc}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Catalog 3 & 4 Buttons inside a beautiful unified container box card */}
          {(settings.catalog3Active !== false || settings.catalog4Active !== false) && (
            <div
              className="mt-6 w-full backdrop-blur-lg rounded-3xl p-5 border shadow-md flex flex-col items-center"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.primaryBorder }}
            >
              <span
                className="text-[10px] font-black uppercase tracking-widest mb-4 font-sans"
                style={{ color: theme.textMuted }}
              >
                {settings.language === 'en' ? 'More Menus' : 'Mais Cardápios'}
              </span>
              <div className="w-full flex flex-row gap-3 items-stretch justify-center">
                {settings.catalog3Active !== false && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedCatalog('catalog3');
                      setActiveScreen('menu');
                    }}
                    className="flex-1 py-4 px-3 rounded-full font-bold text-[10px] tracking-wider uppercase shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border border-white/10 text-center flex items-center justify-center min-h-[44px]"
                    style={{ 
                      backgroundColor: theme.primary, 
                      color: theme.primaryContrast 
                    }}
                  >
                    {settings.catalog3Title || 'Low Carb'}
                  </motion.button>
                )}
                {settings.catalog4Active !== false && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedCatalog('catalog4');
                      setActiveScreen('menu');
                    }}
                    className="flex-1 py-4 px-3 rounded-full font-bold text-[10px] tracking-wider uppercase shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border border-white/10 text-center flex items-center justify-center min-h-[44px]"
                    style={{ 
                      backgroundColor: theme.primary, 
                      color: theme.primaryContrast 
                    }}
                  >
                    {settings.catalog4Title || 'Hipertróficas'}
                  </motion.button>
                )}
              </div>
            </div>
          )}

        </motion.div>
        {renderDietsModal()}
        <InactivityGuard
          enabled={inactivityActive}
          timeoutSeconds={settings.kioskInactivitySeconds || 45}
          countdownSeconds={10}
          primaryColor={settings.primaryColor}
          glassColor={settings.glassColor}
          textColor={settings.textColor}
          language={activeLanguage}
          onResetKiosk={handleFullKioskReset}
        />
      </div>
    );
  }

  if (loading && activeScreen === 'menu') {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[50vh] p-4 text-center select-none">
        <div 
          className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" 
          style={{ borderColor: settings.primaryColor }}
        />
        <p className="mt-4 font-sans font-semibold text-sm text-black/60">
          {k.loadingCatalog}
        </p>
      </div>
    );
  }

  const filteredCategories = localizedCategories.filter(category => {
    const cat = category.catalog || 'catalog1';
    
    // If a category belongs specifically to b2b/corporate, hide it from normal catalogs
    if (cat === 'catalog_b2b' || cat === 'b2b') {
      return false;
    }
    
    if (selectedCatalog) {
      return cat === 'both' || cat === 'all' || cat === selectedCatalog;
    }
    
    return true;
  });

  const liveDetailProduct = selectedProductForDetails
    ? localizedProducts.find((p) => p.id === selectedProductForDetails.id) ||
      selectedProductForDetails
    : null;

  return (
    <div className="flex-grow flex flex-col items-center p-4 pb-32 relative">
      {/* Discreet EN | ES | PT Switcher */}
      {/* Discreet Top-Left Category Menu — ONLY in Mobile Pickup Mode (/#/order) */}
      {isMobilePickup && (() => {
        const mobileActiveCategories = filteredCategories
          .filter((cat) =>
            localizedProducts.some((p) => p.categoryId === cat.id && p.isActive !== false)
          )
          .sort((a, b) =>
            (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
          );
        if (mobileActiveCategories.length === 0) return null;
        const menuLabel =
          activeLanguage === 'es' ? 'Menú' : activeLanguage === 'pt' ? 'Cardápio' : 'Menu';
        return (
          <div ref={mobileCatMenuRef} className="fixed top-4 left-4 z-40">
            <button
              type="button"
              onClick={() => setIsMobileCategoryMenuOpen((prev) => !prev)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-full backdrop-blur-md border shadow-sm flex items-center gap-2 text-[11px] font-bold tracking-wide transition-all cursor-pointer active:scale-95"
              style={{
                backgroundColor: theme.pillBg,
                borderColor: theme.primaryBorder,
                color: theme.text,
              }}
              aria-expanded={isMobileCategoryMenuOpen}
              aria-label={menuLabel}
            >
              <MenuIcon size={15} strokeWidth={2.2} style={{ color: theme.text }} />
              <span>{menuLabel}</span>
              <ChevronDown
                size={13}
                className={cn('transition-transform duration-200 opacity-70', isMobileCategoryMenuOpen && 'rotate-180')}
              />
            </button>

            <AnimatePresence>
              {isMobileCategoryMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                  className="mt-2 w-56 max-h-[65vh] overflow-y-auto rounded-2xl border backdrop-blur-xl shadow-lg py-1.5"
                  style={{
                    backgroundColor: theme.modalBg,
                    borderColor: theme.primaryBorder,
                  }}
                >
                  <div className="flex flex-col divide-y" style={{ borderColor: theme.primaryBorder }}>
                    {mobileActiveCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setIsMobileCategoryMenuOpen(false);
                          const el = document.getElementById(`menu-cat-${cat.id}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-black/5 active:bg-black/10 cursor-pointer flex items-center justify-between gap-2"
                        style={{ color: theme.text, borderColor: theme.primaryBorder }}
                      >
                        <span className="truncate">{cat.title}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })()}

      <div className="fixed top-4 right-4 z-40 flex flex-col items-end gap-2">
        <div
          className="flex items-center gap-1 rounded-full backdrop-blur-md p-1 border shadow-sm"
          style={{
            backgroundColor: theme.pillBg,
            borderColor: theme.primaryBorder,
          }}
        >
          {(['en', 'es', 'pt'] as KioskLanguage[]).map((lang) => {
            const isSelected = activeLanguage === lang;
            return (
              <button
                key={lang}
                type="button"
                onClick={() => setGuestLanguage(lang)}
                className="min-h-[32px] px-3 rounded-full text-[10px] font-black tracking-widest uppercase transition-all cursor-pointer"
                style={{
                  backgroundColor: isSelected ? theme.primary : 'transparent',
                  color: isSelected ? theme.primaryContrast : theme.text,
                }}
              >
                {lang.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Discreet PWA Install Banner in Mobile Pickup Mode */}
      {isMobilePickup && (
        <div className="w-full mt-14">
          <PwaInstallBanner settings={settings} language={activeLanguage} />
        </div>
      )}

      {/* Circular Logo — 5 rapid taps open Secret Admin/KDS modal (Totem mode only) */}
      <div className={`${isMobilePickup ? 'mt-2' : 'mt-8'} mb-4 relative`}>
        <div 
          onClick={handleLogoTap}
          className="w-[160px] h-[160px] rounded-full p-1 shadow-md flex items-center justify-center overflow-hidden border-2 cursor-default"
          style={{ borderColor: theme.primary, backgroundColor: theme.cardBgSolid }}
        >
          <img 
            src={
              selectedCatalog === 'catalog1'
                ? (settings.catalog1Image || 'https://i.ibb.co/X0vYy7L/cakes.png')
                : selectedCatalog === 'catalog2'
                  ? (settings.catalog2Image || 'https://i.ibb.co/68XwD57/meals.png')
                  : selectedCatalog === 'catalog3'
                    ? (settings.catalog3Image || settings.logo || 'https://i.ibb.co/X0vYy7L/cakes.png')
                    : selectedCatalog === 'catalog4'
                      ? (settings.catalog4Image || settings.logo || 'https://i.ibb.co/X0vYy7L/cakes.png')
                      : (settings.logo || 'https://i.ibb.co/1t0DZbPG/patitour-2026-06-05-T085539-099.png')
            } 
            alt="Logo" 
            className="w-full h-full object-cover rounded-full pointer-events-none"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-10 text-center tracking-tight" style={{ color: theme.brandText }}>
        {renderTitle(settings.introTitle || settings.brandName || 'Easy Kioski')}
      </h1>

      {(() => {
        const localizedCatalog1Slogan =
          activeLanguage === 'es'
            ? settings.catalog1Slogan_es || settings.slogan_es
            : activeLanguage === 'pt'
              ? settings.catalog1Slogan_pt || settings.slogan_pt
              : settings.catalog1Slogan_en || settings.slogan_en;
        const localizedCatalog1Desc =
          activeLanguage === 'es'
            ? settings.catalog1Desc_es
            : activeLanguage === 'pt'
              ? settings.catalog1Desc_pt
              : settings.catalog1Desc_en;
        const rawCatalog1Slogan = (settings.catalog1Slogan || settings.catalog1Desc || settings.slogan || '').trim();
        const isDefaultCraftedSlogan =
          /Crafted fresh to order with artisanal ingredients|Artisanal flavors crafted fresh to order|O sabor que você merece/i.test(rawCatalog1Slogan);
        const fallbackTranslatedSlogan =
          activeLanguage === 'es'
            ? 'Preparado fresco al momento con ingredientes artesanales'
            : activeLanguage === 'pt'
              ? 'Preparado fresco na hora com ingredientes artesanais'
              : 'Crafted fresh to order with artisanal ingredients';

        const resolvedCatalog1Text =
          localizedCatalog1Slogan?.trim() ||
          localizedCatalog1Desc?.trim() ||
          (isDefaultCraftedSlogan ? fallbackTranslatedSlogan : rawCatalog1Slogan);

        const text = selectedCatalog === 'catalog1'
          ? resolvedCatalog1Text
          : selectedCatalog === 'catalog2'
            ? (settings.catalog2Slogan || settings.catalog2Desc || localizedCatalog1Slogan || settings.slogan || '')
            : selectedCatalog === 'catalog3'
              ? (settings.catalog3Slogan || settings.catalog3Desc || localizedCatalog1Slogan || settings.slogan || '')
              : selectedCatalog === 'catalog4'
                ? (settings.catalog4Slogan || settings.catalog4Desc || localizedCatalog1Slogan || settings.slogan || '')
                : (resolvedCatalog1Text || fallbackTranslatedSlogan);

        if (selectedCatalog) {
          const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
          if (lines.length > 0) {
            return (
              <div
                className="flex flex-col items-center mb-12 max-w-sm mx-auto backdrop-blur-md p-5 rounded-[2rem] border shadow-md"
                style={{
                  backgroundColor: theme.cardBg,
                  borderColor: theme.primaryBorder,
                }}
              >
                <ul className="text-left space-y-2.5 text-xs font-sans font-semibold" style={{ color: theme.text }}>
                  {lines.map((line, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="shrink-0 select-none mt-0.5" style={{ color: theme.primary }}>✦</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }
        }

        return (
          <p className="font-medium mb-12 text-center whitespace-pre-wrap max-w-md mx-auto" style={{ color: theme.text }}>
            {text}
          </p>
        );
      })()}



      {/* Sticky Category Quick-Jump Bar for Totem / Kiosk Screen */}
      {!isMobilePickup && (() => {
        const activeCategories = filteredCategories
          .filter((cat) =>
            localizedProducts.some((p) => p.categoryId === cat.id && p.isActive !== false)
          )
          .sort((a, b) =>
            (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
          );
        if (activeCategories.length <= 1) return null;
        return (
          <div className="sticky top-3 z-30 w-full max-w-5xl xl:max-w-6xl mb-8">
            <div
              className="flex items-center gap-2 overflow-x-auto no-scrollbar p-2 rounded-2xl backdrop-blur-xl border shadow-sm"
              style={{
                backgroundColor: theme.pillBg,
                borderColor: theme.primaryBorder,
              }}
            >
              {activeCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`menu-cat-${cat.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-serif font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 border hover:opacity-90 active:scale-95"
                  style={{
                    backgroundColor: theme.cardBgSolid,
                    color: theme.categoryText,
                    borderColor: theme.primaryBorder,
                  }}
                >
                  {cat.title}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <div
        className={`w-full space-y-12 ${
          isMobilePickup ? 'max-w-lg' : 'max-w-5xl xl:max-w-6xl px-1 sm:px-4'
        }`}
      >
        {filteredCategories.length > 0 ? (
          filteredCategories.map((category) => {
            const categoryProducts = localizedProducts
              .filter(p => p.categoryId === category.id && p.isActive !== false)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            if (categoryProducts.length === 0) return null;

            return (
              <div key={category.id} id={`menu-cat-${category.id}`} className="space-y-5 scroll-mt-24">
                <div className="border-b pb-2.5" style={{ borderColor: theme.primaryBorder }}>
                  <h2
                    className={`${
                      isMobilePickup ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
                    } font-serif font-black tracking-tight`}
                    style={{ color: theme.categoryText }}
                  >
                    {category.title}
                  </h2>
                </div>
                <div
                  className={
                    isMobilePickup
                      ? 'grid grid-cols-1 sm:grid-cols-2 gap-3.5'
                      : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5'
                  }
                >
                  {categoryProducts.map((product) => (
                    <AnimatedProductCard
                      key={product.id}
                      product={product}
                      category={category}
                      settings={settings}
                      cart={cart}
                      currencySymbol={currencySymbol}
                      requiresSelection={productRequiresCustomerSelection(product, sides)}
                      onSelectProduct={(p) => openProductModal(p)}
                      onAddToCart={(p, qty) => addToCart(p, qty)}
                      onRemoveFromCart={(itemId) => removeFromCart(itemId)}
                      getContrastText={getContrastText}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center p-12 opacity-60 glass rounded-2xl" style={{ color: theme.text }}>
            {k.noProductsFound}
          </div>
        )}
      </div>

      <AnimatePresence>
        {cartItemsCount > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className={`fixed bottom-6 left-4 right-4 mx-auto z-40 space-y-1.5 ${
              isMobilePickup ? 'max-w-lg' : 'max-w-2xl'
            }`}
          >
            {settings.minOrderEnabled && settings.minOrderValue && settings.minOrderValue > 0 && cartTotal < settings.minOrderValue && (
              <div
                className="backdrop-blur-md px-4 py-1.5 rounded-xl text-center text-xs font-bold shadow-lg border flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: theme.modalBg,
                  color: theme.primary,
                  borderColor: theme.primaryBorderStrong,
                }}
              >
                <Lock size={13} />
                <span>
                  {k.minOrderLabel}: {formatMoney(settings.minOrderValue, settings.currency)} ({k.minOrderMissing}: {formatMoney(settings.minOrderValue - cartTotal, settings.currency)})
                </span>
              </div>
            )}
            <button 
              onClick={() => setIsModalOpen(true)}
              className={`w-full ${
                isMobilePickup ? 'min-h-[60px] text-base' : 'min-h-[72px] text-xl'
              } rounded-2xl shadow-2xl flex items-center justify-between px-6 font-bold transition-transform active:scale-95 cursor-pointer`}
              style={{ backgroundColor: theme.primary, color: theme.primaryContrast }}
            >
              <div className="flex items-center gap-3 font-serif">
                <ShoppingBag size={isMobilePickup ? 22 : 26} />
                <span>{k.viewOrder}</span>
              </div>
              <div className="flex items-center gap-2 font-serif text-sm">
                <span className="bg-white/20 px-2.5 py-1 rounded-full">
                  {cartItemsCount} {cartItemsCount === 1 ? k.itemSingular : k.itemPlural}
                </span>
                <span className="text-base font-black">{formatMoney(cartTotal, settings.currency)}</span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isMobilePickup ? (
        <MobilePickupCheckoutModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setCheckoutStep('summary');
          }}
          cart={cart}
          setCart={setCart}
          products={localizedProducts}
          settings={settings}
          language={activeLanguage}
          onRemoveFromCart={removeFromCart}
          onValidateCart={validateCartItems}
        />
      ) : (
        <TotemCheckoutModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setCheckoutStep('summary');
          }}
          cart={cart}
          setCart={setCart}
          products={localizedProducts}
          settings={settings}
          language={activeLanguage}
          onRemoveFromCart={removeFromCart}
          onValidateCart={validateCartItems}
          onOrderCompletedAndReset={handleFullKioskReset}
        />
      )}

      <AnimatePresence>
        {selectedProductForDetails && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProductForDetails(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] font-sans"
              style={{ 
                backgroundColor: theme.modalBg,
                borderColor: theme.primaryBorder,
                color: theme.text,
                '--text-color': theme.text,
                '--modal-heading-color': theme.text
              } as any}
            >
              {/* Header do Modal com Título e Fechar (X) */}
              <div
                className="p-5 pb-3.5 flex items-start justify-between border-b backdrop-blur-sm sticky top-0 z-20"
                style={{
                  backgroundColor: theme.modalBg,
                  borderColor: theme.primaryBorder,
                }}
              >
                <div className="pr-4">
                  <h2 
                    className="text-xl sm:text-2xl font-serif font-black tracking-tight leading-snug"
                    style={{ color: theme.text }}
                  >
                    {(liveDetailProduct || selectedProductForDetails).title}
                  </h2>
                  {(liveDetailProduct || selectedProductForDetails).categoryTitle && (
                    <span
                      className="inline-block mt-1 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border"
                      style={{
                        backgroundColor: theme.primaryTint08,
                        color: theme.categoryText,
                        borderColor: theme.primaryBorder,
                      }}
                    >
                      {(liveDetailProduct || selectedProductForDetails).categoryTitle}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProductForDetails(null)}
                  className="p-1.5 rounded-full transition-colors cursor-pointer flex-shrink-0"
                  style={{ color: theme.textMuted, backgroundColor: theme.primaryTint05 }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Container de Conteúdo com Scroll */}
              <div className="overflow-y-auto w-full flex-grow p-5 space-y-5">
                {/* Imagem do Produto (sempre com cantos arredondados harmoniosos) */}
                <div
                  className={cn(
                    'rounded-2xl overflow-hidden shadow-sm border flex items-center justify-center',
                    isMobilePickup
                      ? 'w-full max-w-[360px] mx-auto aspect-square'
                      : 'w-full aspect-[16/10]'
                  )}
                  style={{
                    backgroundColor: theme.cardBgSolid,
                    borderColor: theme.primaryBorder,
                  }}
                >
                  <img 
                    src={selectedProductForDetails.image} 
                    alt={(liveDetailProduct || selectedProductForDetails).title} 
                    className="w-full h-full object-cover rounded-2xl"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Descrição Detalhada (Traduzida) */}
                {(liveDetailProduct || selectedProductForDetails).description && (
                  <p className="text-xs sm:text-sm leading-relaxed font-medium" style={{ color: theme.textMuted }}>
                    {(liveDetailProduct || selectedProductForDetails).description}
                  </p>
                )}

                {/* Alérgicos / Ingredientes (apenas leitura quando não usado como exclusões interativas) */}
                {!selectedProductForDetails.isMeal && (liveDetailProduct || selectedProductForDetails).ingredients && (
                  <p
                    className="text-[11px] font-bold p-3 rounded-xl border leading-relaxed"
                    style={{
                      backgroundColor: theme.primaryTint08,
                      borderColor: theme.primaryBorder,
                      color: theme.text,
                    }}
                  >
                    <span className="uppercase font-black" style={{ color: theme.primary }}>
                      {activeLanguage === 'es'
                        ? 'ALÉRGENOS / INGREDIENTES:'
                        : activeLanguage === 'pt'
                          ? 'ALÉRGICOS / INFORMAÇÕES:'
                          : 'ALLERGENS / INGREDIENTS:'}
                    </span>{' '}
                    {(liveDetailProduct || selectedProductForDetails).ingredients}
                  </p>
                )}

                {/* Opções de Tamanho / Quantidade */}
                {selectedProductForDetails.hasSizes !== false && selectedProductForDetails.sizes && selectedProductForDetails.sizes.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2">
                      <Layers size={16} style={{ color: theme.primary }} />
                      <label className="text-xs font-black uppercase tracking-wider" style={{ color: theme.text }}>
                        {activeLanguage === 'es'
                          ? 'ELIGE TAMAÑO / CANTIDAD *'
                          : activeLanguage === 'pt'
                            ? 'ESCOLHA O TAMANHO / QUANTIDADE *'
                            : 'CHOOSE SIZE / QUANTITY *'}
                      </label>
                    </div>
                    <div className="space-y-2.5">
                      {selectedProductForDetails.sizes.map((s, idx) => {
                        const isSelected = selectedSize?.id === s.id;
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setSelectedSize(s);
                              if (selectedProductForDetails.isCustomSandwich) {
                                const newMax = getMaxFillingsForProduct(selectedProductForDetails, s);
                                setSelectedSandwichFillings(prev => prev.slice(0, newMax));
                              }
                            }}
                            className="p-4 rounded-2xl flex justify-between items-center cursor-pointer transition-all"
                            style={{
                              borderWidth: isSelected ? 2 : 1,
                              borderStyle: 'solid',
                              borderColor: isSelected ? theme.primary : theme.primaryBorder,
                              backgroundColor: isSelected ? theme.primaryTint08 : theme.cardBgSolid,
                            }}
                          >
                            <span className="font-bold text-xs sm:text-sm" style={{ color: theme.text }}>{s.name}</span>
                            <div className="text-right">
                              {(s.oldPrice ?? 0) > 0 && (
                                <span className="text-[10px] line-through block leading-none" style={{ color: theme.textSoft }}>
                                  {currencySymbol}{s.oldPrice!.toFixed(2)}
                                </span>
                              )}
                              <span className="font-serif font-black text-sm" style={{ color: theme.price }}>
                                {currencySymbol}{s.price.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Preço se não tiver tamanhos múltiplos */}
                {(!(selectedProductForDetails.hasSizes !== false && selectedProductForDetails.sizes && selectedProductForDetails.sizes.length > 0)) && (
                  <div
                    className="p-3.5 rounded-2xl border flex items-baseline gap-2"
                    style={{
                      backgroundColor: theme.cardBgSolid,
                      borderColor: theme.primaryBorder,
                    }}
                  >
                    {(selectedProductForDetails.isCustomCake || selectedProductForDetails.priceType === 'consult') ? (
                      <span className="text-xl font-bold block font-serif" style={{ color: theme.price }}>
                        {k.onRequest}
                      </span>
                    ) : (
                      <>
                        <p className="text-2xl font-serif font-black" style={{ color: theme.price }}>
                          {currencySymbol}{(selectedProductForDetails.price > 0 ? selectedProductForDetails.price : (selectedProductForDetails.oldPrice || 0)).toFixed(2)}
                        </p>
                        {selectedProductForDetails.price > 0 && (selectedProductForDetails.oldPrice ?? 0) > 0 && (
                          <span className="text-sm line-through" style={{ color: theme.textSoft }}>
                            {currencySymbol}{selectedProductForDetails.oldPrice!.toFixed(2)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}



                  {/* Custom Cake Options in Details Modal */}
                  {selectedProductForDetails.isCustomCake && (
                    <div className="border-t border-gray-200/30 pt-6 space-y-6">
                      <h4 className="text-sm font-black uppercase tracking-wider" style={{ color: settings.textColor || '#000000', opacity: 0.7 }}>Personalização do Bolo</h4>
                      
                      {/* Size Selection */}
                      {cakeSizesList.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-bold" style={{ color: settings.textColor || '#000000', opacity: 0.7 }}>Tamanho / Fatias / Peso</p>
                          <div className="grid grid-cols-1 gap-2">
                            {cakeSizesList.map((sizeOpt, idx) => {
                              const isSelected = selectedCakeSize === sizeOpt;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setSelectedCakeSize(sizeOpt)}
                                  className={cn(
                                    "p-3 rounded-xl border-2 transition-all flex justify-between items-center w-full text-left font-bold text-xs cursor-pointer",
                                    isSelected 
                                      ? "shadow-md scale-[1.01]" 
                                      : "bg-white border-gray-200 hover:border-gray-300"
                                  )}
                                  style={{ 
                                    backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                    color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : (settings.textColor || '#000000'),
                                    borderColor: settings.primaryColor || '#865d39'
                                  }}
                                >
                                  <span>{sizeOpt}</span>
                                  {isSelected && <Check size={12} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Dough Selection */}
                      {cakeDoughsList.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-bold" style={{ color: settings.textColor || '#000000', opacity: 0.7 }}>Seleção de Massa</p>
                          <div className="grid grid-cols-2 gap-2">
                            {cakeDoughsList.map((doughOpt, idx) => {
                              const isSelected = selectedDough === doughOpt;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setSelectedDough(doughOpt)}
                                  className={cn(
                                    "p-2.5 rounded-xl border-2 transition-all text-center text-xs font-bold w-full cursor-pointer",
                                    isSelected 
                                      ? "shadow-md" 
                                      : "bg-white border-gray-200 hover:border-gray-300"
                                  )}
                                  style={{ 
                                    backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                    color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : (settings.textColor || '#000000'),
                                    borderColor: settings.primaryColor || '#865d39'
                                  }}
                                >
                                  {doughOpt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Fillings Selection */}
                      {cakeFillingsList.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex justify-between items-baseline">
                            <p className="text-xs font-bold" style={{ color: settings.textColor || '#000000', opacity: 0.7 }}>Opções de Recheio</p>
                            <span className="text-[10px] opacity-70 font-bold" style={{ color: settings.textColor || '#000000' }}>Escolha até {settings.cakeFillingsMax || 2}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {cakeFillingsList.map((fillingOpt, idx) => {
                              const isSelected = selectedFillings.includes(fillingOpt);
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedFillings(selectedFillings.filter(f => f !== fillingOpt));
                                    } else {
                                      const maxFillings = settings.cakeFillingsMax || 2;
                                      if (selectedFillings.length >= maxFillings) {
                                        toast.error(`Você pode escolher no máximo ${maxFillings} recheios!`);
                                        return;
                                      }
                                      setSelectedFillings([...selectedFillings, fillingOpt]);
                                    }
                                  }}
                                  className={cn(
                                    "p-2.5 rounded-xl border-2 transition-all flex items-center justify-between font-bold text-xs cursor-pointer",
                                    isSelected 
                                      ? "shadow-md" 
                                      : "bg-white border-gray-200 hover:border-gray-300"
                                  )}
                                  style={{ 
                                    backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                    color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : (settings.textColor || '#000000'),
                                    borderColor: settings.primaryColor || '#865d39'
                                  }}
                                >
                                  <span>{fillingOpt}</span>
                                  {isSelected && <Check size={12} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Toppings Selection */}
                      {cakeToppingsList.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-bold" style={{ color: settings.textColor || '#000000', opacity: 0.7 }}>Seleção de Cobertura</p>
                          <div className="grid grid-cols-2 gap-2">
                            {cakeToppingsList.map((toppingOpt, idx) => {
                              const isSelected = selectedTopping === toppingOpt;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setSelectedTopping(toppingOpt)}
                                  className={cn(
                                    "p-2.5 rounded-xl border-2 transition-all text-center text-xs font-bold w-full cursor-pointer",
                                    isSelected 
                                      ? "shadow-md" 
                                      : "bg-white border-gray-200 hover:border-gray-300"
                                  )}
                                  style={{ 
                                    backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                    color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : (settings.textColor || '#000000'),
                                    borderColor: settings.primaryColor || '#865d39'
                                  }}
                                >
                                  {toppingOpt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Topper Selection */}
                      {cakeToppersList.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-bold" style={{ color: settings.textColor || '#000000', opacity: 0.7 }}>Topo de Bolo</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {cakeToppersList.map((topperOpt, idx) => {
                              const isSelected = selectedTopper === topperOpt;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setSelectedTopper(topperOpt)}
                                  className={cn(
                                    "p-2.5 rounded-xl border-2 transition-all text-center text-xs font-bold w-full cursor-pointer",
                                    isSelected 
                                      ? "shadow-md" 
                                      : "bg-white border-gray-200 hover:border-gray-300"
                                  )}
                                  style={{ 
                                    backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                    color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : (settings.textColor || '#000000'),
                                    borderColor: settings.primaryColor || '#865d39'
                                  }}
                                >
                                  {topperOpt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Style Selection Reference */}
                      {selectedProductForDetails.cakeGalleryId && (
                        (() => {
                          const associatedGallery = galleries.find(g => g.id === selectedProductForDetails.cakeGalleryId);
                          const validImages = associatedGallery?.images?.filter(img => img && img.trim() !== '') || [];
                          if (validImages.length === 0) return null;
                          
                          const noStyleText = selectedStyleNumber === null ? 'Selecionado: Base Tradicional' : 'Selecionar: Base Tradicional';

                          return (
                            <div className="space-y-3 pt-2">
                              <p className="text-xs font-bold" style={{ color: settings.textColor || '#000000', opacity: 0.7 }}>Estilo do Bolo / Referência Visual</p>
                              <div className="w-full mb-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedStyleNumber(null)}
                                  className={cn(
                                    "w-full py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 border-2 cursor-pointer uppercase",
                                    selectedStyleNumber === null
                                      ? "shadow-md text-white border-transparent"
                                      : "bg-white border-gray-200 hover:border-gray-300"
                                  )}
                                  style={{
                                    backgroundColor: selectedStyleNumber === null ? (settings.primaryColor || '#865d39') : '#ffffff',
                                    color: selectedStyleNumber === null ? getContrastText(settings.primaryColor || '#865d39') : (settings.textColor || '#000000'),
                                    borderColor: settings.primaryColor || '#865d39'
                                  }}
                                >
                                  {selectedStyleNumber === null ? <Check size={12} /> : <X size={12} />}
                                  <span>{noStyleText}</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                {associatedGallery?.images?.map((img, idx) => {
                                  if (!img || img.trim() === '') return null;
                                  const isSelected = selectedStyleNumber === (idx + 1);
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => setSelectedStyleNumber(idx + 1)}
                                      className={cn(
                                        "relative aspect-square rounded-xl overflow-hidden border-2 transition-all bg-white p-0 text-left cursor-pointer",
                                        isSelected ? "scale-[1.01]" : "border-gray-200 hover:border-gray-300"
                                      )}
                                      style={{ borderColor: isSelected ? (settings.primaryColor || '#865d39') : 'transparent' }}
                                    >
                                      <img
                                        src={img}
                                        alt={`Style ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="absolute top-1 left-1 bg-black/75 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full z-10">
                                        #{idx + 1}
                                      </div>
                                      {isSelected && (
                                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                                          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: settings.primaryColor || '#865d39', color: getContrastText(settings.primaryColor || '#865d39') }}>
                                            <Check size={12} />
                                          </div>
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}

                  {/* Customizable Fillings Selection (Tapiocas / Sandwiches / Bowls) */}
                  {selectedProductForDetails.isCustomSandwich && (() => {
                    const activeProd = liveDetailProduct || selectedProductForDetails;
                    const fillingsList = (activeProd.customFillings || '')
                      .split(',')
                      .map(f => f.trim())
                      .filter(Boolean);
                    if (fillingsList.length === 0) return null;

                    const maxFillingsAllowed = getMaxFillingsForProduct(activeProd, selectedSize);
                    const helperLabel =
                      activeLanguage === 'es'
                        ? `Elige hasta ${maxFillingsAllowed} ${maxFillingsAllowed === 1 ? 'relleno' : 'rellenos'}`
                        : activeLanguage === 'pt'
                          ? `Escolha até ${maxFillingsAllowed} ${maxFillingsAllowed === 1 ? 'recheio' : 'recheios'}`
                          : `Choose up to ${maxFillingsAllowed} ${maxFillingsAllowed === 1 ? 'filling' : 'fillings'}`;
                    const sectionTitle =
                      activeLanguage === 'es'
                        ? 'Elige los Rellenos'
                        : activeLanguage === 'pt'
                          ? 'Escolha os Recheios'
                          : 'Select Fillings';

                    return (
                      <div className="border-t border-gray-200/30 pt-6 space-y-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs sm:text-sm font-black tracking-wide" style={{ color: theme.text }}>
                            {sectionTitle}
                            {activeProd.fillingsRequired !== false && (
                              <span className="ml-1" style={{ color: theme.primary }}>*</span>
                            )}
                          </h4>
                          <span className="text-[11px] font-bold" style={{ color: theme.textMuted }}>
                            {helperLabel}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {fillingsList.map((fillingOpt, idx) => {
                            const isSelected = selectedSandwichFillings.includes(fillingOpt);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedSandwichFillings(prev => prev.filter(f => f !== fillingOpt));
                                  } else if (maxFillingsAllowed === 1) {
                                    setSelectedSandwichFillings([fillingOpt]);
                                  } else if (selectedSandwichFillings.length >= maxFillingsAllowed) {
                                    toast.info(
                                      activeLanguage === 'es'
                                        ? `Puedes elegir como máximo ${maxFillingsAllowed} rellenos.`
                                        : activeLanguage === 'pt'
                                          ? `Você pode escolher no máximo ${maxFillingsAllowed} recheios.`
                                          : `You can choose up to ${maxFillingsAllowed} fillings.`
                                    );
                                  } else {
                                    setSelectedSandwichFillings(prev => [...prev, fillingOpt]);
                                  }
                                }}
                                className="px-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-2 text-left text-xs font-bold cursor-pointer shadow-xs active:scale-[0.98]"
                                style={{
                                  backgroundColor: isSelected ? theme.primary : theme.cardBgSolid,
                                  color: isSelected ? theme.primaryContrast : theme.text,
                                  borderColor: isSelected ? theme.primary : theme.primaryBorder,
                                  borderWidth: isSelected ? 2 : 1,
                                }}
                              >
                                <span className="leading-snug">{fillingOpt}</span>
                                {isSelected && <Check size={14} className="shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Customizable Meal Options in Details Modal */}
                  {selectedProductForDetails.isMeal && (() => {
                    const activeProd = liveDetailProduct || selectedProductForDetails;
                    const hasExclusions = !!(activeProd.ingredients && activeProd.ingredients.split(',').map(i => i.trim()).filter(Boolean).length > 0);
                    const hasSides = !!(activeProd.allowedSides && activeProd.allowedSides.filter(id => sides.some(s => s.id === id)).length > 0);
                    if (!hasExclusions && !hasSides) return null;
                    return (
                      <div className="border-t border-gray-200/30 pt-6 space-y-6">
                        <h4 className="text-sm font-black uppercase tracking-wider" style={{ color: settings.textColor || '#000000', opacity: 0.75 }}>
                          {activeLanguage === 'es'
                            ? 'Personalizar Plato'
                            : activeLanguage === 'pt'
                              ? 'Personalizar Prato'
                              : 'Meal Customization'}
                        </h4>
                        
                        {/* Exclusions */}
                        {activeProd.ingredients && (() => {
                          const ingredientsList = activeProd.ingredients
                            .split(',')
                            .map(i => i.trim())
                            .filter(Boolean);
                          if (ingredientsList.length === 0) return null;
                          return (
                            <div className="space-y-3">
                              <p className="text-xs font-bold" style={{ color: settings.textColor || '#000000', opacity: 0.7 }}>{t.excludeIngredients}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {ingredientsList.map((ingredient, idx) => {
                                  const isSelected = mealSelections.removals.includes(ingredient);
                                  return (
                                    <button 
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        if (isSelected) {
                                          setMealSelections({
                                            ...mealSelections,
                                            removals: mealSelections.removals.filter(r => r !== ingredient)
                                          });
                                        } else {
                                          setMealSelections({
                                            ...mealSelections,
                                            removals: [...mealSelections.removals, ingredient]
                                          });
                                        }
                                      }}
                                      className={cn(
                                        "px-3 py-1.5 rounded-full border-2 font-bold transition-all text-xs cursor-pointer",
                                        isSelected 
                                          ? "bg-red-500 border-red-500 text-white shadow-sm" 
                                          : "bg-white border-gray-200"
                                      )}
                                      style={{ color: isSelected ? '#ffffff' : (settings.textColor || '#000000') }}
                                    >
                                      {ingredient}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Sides and Swaps */}
                        {activeProd.allowedSides && activeProd.allowedSides.length > 0 && (
                          (() => {
                            const allowedSidesList = (activeProd.allowedSides || [])
                              .map(id => localizedSides.find(s => s.id === id))
                              .filter(Boolean) as Side[];
                            
                            const regularSides = allowedSidesList.filter(s => s.type !== 'swap');
                            const swapSides = allowedSidesList.filter(s => s.type === 'swap');

                            if (regularSides.length === 0 && swapSides.length === 0) return null;

                            const freeLabel =
                              activeLanguage === 'es' ? 'Gratis' : activeLanguage === 'pt' ? 'Grátis' : 'Free';

                            const renderSideItem = (side: Side) => {
                              const qty = sideQuantities[side.id] || 0;
                              return (
                                <div 
                                  key={side.id}
                                  className={cn(
                                    "p-3 rounded-xl border border-gray-200 font-bold transition-all flex justify-between items-center bg-white text-xs shadow-sm"
                                  )}
                                  style={{ color: settings.textColor || '#000000' }}
                                >
                                  <div className="flex flex-col min-w-0 pr-2">
                                    <span className="font-bold truncate" style={{ color: settings.textColor || '#000000' }}>{side.name}</span>
                                    <span className="text-[10px] opacity-60 font-extrabold mt-0.5" style={{ color: settings.textColor || '#000000' }}>
                                      {side.price > 0 ? `+ ${currencySymbol}${side.price.toFixed(2)}` : freeLabel}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                    <button 
                                      type="button"
                                      onClick={() => setSideQuantities(prev => ({ ...prev, [side.id]: Math.max(0, (prev[side.id] || 0) - 1) }))}
                                      className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform cursor-pointer border border-gray-200 focus:outline-none"
                                      style={{ color: settings.textColor || '#000000' }}
                                    >
                                      <Minus size={12} />
                                    </button>
                                    <span className="w-4 text-center font-bold" style={{ color: settings.textColor || '#000000' }}>{qty}</span>
                                    <button 
                                      type="button"
                                      onClick={() => setSideQuantities(prev => ({ ...prev, [side.id]: (prev[side.id] || 0) + 1 }))}
                                      className="w-7 h-7 rounded-full flex items-center justify-center active:scale-95 transition-transform cursor-pointer focus:outline-none"
                                      style={{ backgroundColor: settings.primaryColor || '#865d39', color: getContrastText(settings.primaryColor || '#865d39') }}
                                    >
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            };

                            return (
                              <div className="space-y-4">
                                {regularSides.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-bold" style={{ color: settings.textColor || '#000000', opacity: 0.7 }}>{t.chooseSides}</p>
                                    <div className="grid grid-cols-1 gap-1.5">
                                      {regularSides.map(renderSideItem)}
                                    </div>
                                  </div>
                                )}
                                {swapSides.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-bold" style={{ color: theme.primary }}>
                                      {activeLanguage === 'es'
                                        ? 'Opciones de Cambio (Swap)'
                                        : activeLanguage === 'pt'
                                          ? 'Opções de Troca (Swap)'
                                          : 'Swap Options (Swap)'}
                                    </p>
                                    <div className="grid grid-cols-1 gap-1.5">
                                      {swapSides.map(renderSideItem)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        )}
                      </div>
                    );
                  })()}
                </div>

              {/* Bottom Sticky Action Bar */}
              <div
                className="p-4 border-t flex items-center gap-3 mt-auto"
                style={{
                  backgroundColor: theme.modalBg,
                  borderColor: theme.primaryBorder,
                }}
              >
                {(() => {
                  const activeProd = liveDetailProduct || selectedProductForDetails;
                  const hasSizesOpt = !!(activeProd.hasSizes !== false && activeProd.sizes && activeProd.sizes.length > 0);
                  const hasExclusionsOpt = !!(activeProd.isMeal && activeProd.ingredients && activeProd.ingredients.split(',').map(i => i.trim()).filter(Boolean).length > 0);
                  const hasSidesOpt = !!(activeProd.isMeal && activeProd.allowedSides && activeProd.allowedSides.filter(id => sides.some(s => s.id === id)).length > 0);
                  const isCustomCakeOpt = !!activeProd.isCustomCake;
                  const hasFillingsOpt = !!(activeProd.isCustomSandwich && activeProd.customFillings && activeProd.customFillings.split(',').map(f => f.trim()).filter(Boolean).length > 0);

                  const isCakeIncomplete = activeProd.isCustomCake && (
                    (cakeSizesList.length > 0 && !selectedCakeSize) ||
                    (cakeDoughsList.length > 0 && !selectedDough) ||
                    (cakeFillingsList.length > 0 && selectedFillings.length === 0) ||
                    (cakeToppingsList.length > 0 && !selectedTopping) ||
                    (cakeToppersList.length > 0 && !selectedTopper)
                  );

                  const isSandwichIncomplete =
                    hasFillingsOpt &&
                    activeProd.fillingsRequired !== false &&
                    selectedSandwichFillings.length === 0;

                  const basePrice = (hasSizesOpt && selectedSize) 
                    ? selectedSize.price 
                    : (activeProd.price > 0 ? activeProd.price : (activeProd.oldPrice || 0));
                  
                  const sidesPrice = Object.entries(sideQuantities).reduce((sum, [id, qty]) => {
                    const side = sides.find(s => s.id === id);
                    return sum + (side ? side.price * (qty as number) : 0);
                  }, 0);

                  const totalPrice = basePrice + sidesPrice;
                  const isDisabled = !!isCakeIncomplete || !!isSandwichIncomplete;
                  const minQ = activeProd?.minQuantity && activeProd.minQuantity > 1 ? activeProd.minQuantity : 1;

                  return (
                    <>
                      {/* Stepper [- 1 +] */}
                      <div
                        className="flex items-center gap-2.5 border rounded-full px-2.5 py-1.5 shadow-xs flex-shrink-0"
                        style={{
                          backgroundColor: theme.cardBgSolid,
                          borderColor: theme.primaryBorder,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (customItemQuantity <= minQ) {
                              if (minQ > 1) {
                                toast.info(settings.language === 'en' 
                                  ? `Minimum quantity is ${minQ}.` 
                                  : `Quantidade mínima é ${minQ}.`);
                              }
                              return;
                            }
                            setCustomItemQuantity(prev => Math.max(minQ, prev - 1));
                          }}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                          style={{ backgroundColor: theme.primaryTint08, color: theme.primary }}
                        >
                          <Minus size={12} />
                        </button>
                        <span className="font-black text-xs min-w-[16px] text-center" style={{ color: theme.text }}>
                          {customItemQuantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCustomItemQuantity(prev => prev + 1)}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                          style={{ backgroundColor: theme.primaryTint08, color: theme.primary }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* Botão ADICIONAR À SACOLA */}
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          const requiresFullCustomization = hasSizesOpt || hasExclusionsOpt || hasSidesOpt || isCustomCakeOpt || hasFillingsOpt;
                          if (requiresFullCustomization) {
                            addDetailedProductToCart(activeProd);
                          } else {
                            addToCart(activeProd, customItemQuantity);
                            setSelectedProductForDetails(null);
                          }
                        }}
                        className={cn(
                          "flex-1 py-3.5 px-4 sm:px-5 rounded-2xl flex items-center justify-between font-bold shadow-lg transition-all cursor-pointer",
                          isDisabled ? "opacity-50 cursor-not-allowed" : "hover:brightness-110 active:scale-[0.99]"
                        )}
                        style={{ backgroundColor: theme.primary, color: theme.primaryContrast }}
                      >
                        <div className="flex items-center gap-2">
                          <ShoppingBag size={16} />
                          <span className="text-xs uppercase tracking-wider font-extrabold">
                            {activeLanguage === 'es'
                              ? 'AGREGAR AL PEDIDO'
                              : activeLanguage === 'pt'
                                ? 'ADICIONAR À SACOLA'
                                : 'ADD TO BAG'}
                          </span>
                        </div>
                        {totalPrice > 0 ? (
                          <span className="font-serif font-black text-sm" style={{ color: theme.primaryContrast }}>
                            {currencySymbol}{(totalPrice * customItemQuantity).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-xs opacity-90">
                            {k.onRequest}
                          </span>
                        )}
                      </button>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCustomModalOpen && selectedProductForCustom && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCustomModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg rounded-[2.5rem] border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] force-dark-headings"
              style={{
                backgroundColor: theme.modalBg,
                borderColor: theme.primaryBorder,
                color: theme.text,
              }}
            >
              <div
                className="p-6 border-b flex items-center justify-between"
                style={{ borderColor: theme.primaryBorder, backgroundColor: theme.cardBg }}
              >
                <h2 className="text-2xl font-serif font-bold" style={{ color: theme.text }}>
                  {selectedProductForCustom.isCustomSandwich ? selectedProductForCustom.title : t.customCakeTitle}
                </h2>
                <button 
                  onClick={() => setIsCustomModalOpen(false)} 
                  className="p-2 rounded-full transition-colors cursor-pointer"
                  style={{ color: theme.text, backgroundColor: theme.primaryTint05 }}
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">
                {selectedProductForCustom.isCustomSandwich ? (
                  <>
                    {/* Sizes Selection for Custom Sandwich */}
                    {selectedProductForCustom.sizes && selectedProductForCustom.sizes.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-black">
                          {settings.language === 'en' ? 'Select Option' : 'Selecione a Opção de Estado'}
                        </h3>
                        <div className="grid grid-cols-1 gap-2.5">
                          {selectedProductForCustom.sizes.map((s) => {
                            const isSelected = selectedSize?.id === s.id;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setSelectedSize(s);
                                  setSelectedSandwichFillings([]);
                                }}
                                className={cn(
                                  "p-4 rounded-2xl border-2 transition-all flex justify-between items-center w-full text-left font-bold",
                                  isSelected 
                                    ? "shadow-md scale-[1.01]" 
                                    : "bg-white border-gray-200/50 hover:border-gray-300 text-black"
                                )}
                                style={{ 
                                  backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                  color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : '#000000',
                                  borderColor: settings.primaryColor || '#865d39'
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold">{s.name}</span>
                                  {s.price && s.price > 0 && (
                                    <span className="text-xs opacity-80 font-semibold mt-0.5">
                                      {currencySymbol}{s.price.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                {isSelected && (
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: getContrastText(settings.primaryColor || '#865d39'), color: settings.primaryColor || '#865d39' }}>
                                    <Check size={12} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Fillings Selection for Custom Sandwich */}
                    {selectedProductForCustom.customFillings && (() => {
                      const fillingsList = selectedProductForCustom.customFillings
                        .split(',')
                        .map(f => f.trim())
                        .filter(Boolean);
                      if (fillingsList.length === 0) return null;
                      return (
                        <div className="space-y-4 pt-4 border-t border-gray-200/30">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-black">
                            {settings.language === 'en' ? 'Select Quantities per Option' : 'Selecione as Quantidades por Opção'}
                          </h3>
                          <div className="grid grid-cols-1 gap-2.5">
                            {fillingsList.map((fillingOpt, idx) => {
                              const qty = sandwichFillingQuantities[fillingOpt] || 0;
                              return (
                                <div
                                  key={idx}
                                  className="p-3.5 rounded-2xl border transition-all flex items-center justify-between font-bold text-sm bg-white/70 border-white/25 shadow-sm"
                                >
                                  <span className="text-sm font-bold text-black">{fillingOpt}</span>
                                  
                                  <div className="flex items-center gap-3">
                                    <button
                                      type="button"
                                      disabled={qty === 0}
                                      onClick={() => {
                                        setSandwichFillingQuantities(prev => ({
                                          ...prev,
                                          [fillingOpt]: Math.max(0, qty - 1)
                                        }));
                                      }}
                                      className={cn(
                                        "w-8 h-8 rounded-full bg-white flex items-center justify-center text-black border border-gray-200 shadow-sm cursor-pointer active:scale-95 transition-all text-sm font-bold",
                                        qty === 0 ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-50"
                                      )}
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <span className="text-sm font-black min-w-[20px] text-center text-black">{qty}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSandwichFillingQuantities(prev => ({
                                          ...prev,
                                          [fillingOpt]: qty + 1
                                        }));
                                      }}
                                      className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md cursor-pointer active:scale-95 transition-all text-sm font-bold"
                                      style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : selectedProductForCustom.isCustomCake ? (
                  <>
                    {/* Size Selection */}
                    {cakeSizesList.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-serif font-black uppercase tracking-widest text-black/80">Size / Slices / Weight</h3>
                        <div className="grid grid-cols-1 gap-2.5">
                          {cakeSizesList.map((sizeOpt, idx) => {
                            const isSelected = selectedCakeSize === sizeOpt;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSelectedCakeSize(sizeOpt)}
                                className={cn(
                                  "p-4 rounded-2xl border-2 transition-all flex justify-between items-center w-full text-left font-bold",
                                  isSelected 
                                    ? "shadow-md scale-[1.01]" 
                                    : "bg-white border-gray-200/50 hover:border-gray-300 text-black"
                                )}
                                style={{ 
                                  backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                  color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : '#000000',
                                  borderColor: settings.primaryColor || '#865d39'
                                }}
                              >
                                <span className="font-bold text-sm">
                                  {sizeOpt}
                                </span>
                                {isSelected && (
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: getContrastText(settings.primaryColor || '#865d39'), color: settings.primaryColor || '#865d39' }}>
                                    <Check size={12} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Dough Selection */}
                    {cakeDoughsList.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-serif font-black uppercase tracking-widest text-black/80">Dough Selection</h3>
                        <div className="grid grid-cols-2 gap-2.5">
                          {cakeDoughsList.map((doughOpt, idx) => {
                            const isSelected = selectedDough === doughOpt;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSelectedDough(doughOpt)}
                                className={cn(
                                  "p-3 rounded-2xl border-2 transition-all text-center text-sm font-bold w-full",
                                  isSelected 
                                    ? "shadow-md" 
                                    : "bg-white border-gray-200/50 hover:border-gray-300 text-black"
                                )}
                                style={{ 
                                  backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                  color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : '#000000',
                                  borderColor: settings.primaryColor || '#865d39'
                                }}
                              >
                                {doughOpt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Fillings Selection */}
                    {cakeFillingsList.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-baseline">
                          <h3 className="text-sm font-serif font-black uppercase tracking-widest text-black/80">Filling Options</h3>
                          <span className="text-xs text-gray-500 font-bold">Choose up to {settings.cakeFillingsMax || 2}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {cakeFillingsList.map((fillingOpt, idx) => {
                            const isSelected = selectedFillings.includes(fillingOpt);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedFillings(selectedFillings.filter(f => f !== fillingOpt));
                                  } else {
                                    const maxFillings = settings.cakeFillingsMax || 2;
                                    if (selectedFillings.length >= maxFillings) {
                                      toast.error(`You can choose a maximum of ${maxFillings} fillings!`);
                                      return;
                                    }
                                    setSelectedFillings([...selectedFillings, fillingOpt]);
                                  }
                                }}
                                className={cn(
                                  "p-3 rounded-2xl border-2 transition-all flex items-center justify-between font-bold text-sm",
                                  isSelected 
                                    ? "shadow-md" 
                                    : "bg-white border-gray-200/50 hover:border-gray-300 text-black"
                                )}
                                style={{ 
                                  backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                  color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : '#000000',
                                  borderColor: settings.primaryColor || '#865d39'
                                }}
                              >
                                <span>{fillingOpt}</span>
                                <div className={cn(
                                  "w-4 h-4 rounded-md border flex items-center justify-center",
                                  isSelected ? "border-transparent" : "border-gray-300 bg-white"
                                )}
                                style={{ 
                                  backgroundColor: isSelected ? getContrastText(settings.primaryColor || '#865d39') : 'transparent',
                                  color: isSelected ? (settings.primaryColor || '#865d39') : 'transparent'
                                }}
                                >
                                  {isSelected && <Check size={10} />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Toppings Selection */}
                    {cakeToppingsList.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-serif font-black uppercase tracking-widest text-black/80">Topping Selection</h3>
                        <div className="grid grid-cols-2 gap-2.5">
                          {cakeToppingsList.map((toppingOpt, idx) => {
                            const isSelected = selectedTopping === toppingOpt;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSelectedTopping(toppingOpt)}
                                className={cn(
                                  "p-3 rounded-2xl border-2 transition-all text-center text-sm font-bold w-full",
                                  isSelected 
                                    ? "shadow-md" 
                                    : "bg-white border-gray-200/50 hover:border-gray-300 text-black"
                                )}
                                style={{ 
                                  backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                  color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : '#000000',
                                  borderColor: settings.primaryColor || '#865d39'
                                }}
                              >
                                {toppingOpt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Topper Selection */}
                    {cakeToppersList.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-serif font-black uppercase tracking-widest text-black/80">Cake Topper</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {cakeToppersList.map((topperOpt, idx) => {
                            const isSelected = selectedTopper === topperOpt;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSelectedTopper(topperOpt)}
                                className={cn(
                                  "p-3 rounded-2xl border-2 transition-all text-center text-sm font-bold w-full",
                                  isSelected 
                                    ? "shadow-md" 
                                    : "bg-white border-gray-200/50 hover:border-gray-300 text-black"
                                )}
                                style={{ 
                                  backgroundColor: isSelected ? (settings.primaryColor || '#865d39') : '#ffffff',
                                  color: isSelected ? getContrastText(settings.primaryColor || '#865d39') : '#000000',
                                  borderColor: settings.primaryColor || '#865d39'
                                }}
                              >
                                {topperOpt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Gallery Style Selection */}
                    {selectedProductForCustom.cakeGalleryId && (
                      (() => {
                        const associatedGallery = galleries.find(g => g.id === selectedProductForCustom.cakeGalleryId);
                        const validImages = associatedGallery?.images?.filter(img => img && img.trim() !== '') || [];
                        if (validImages.length === 0) return null;
                        
                        const noStyleText = selectedStyleNumber === null ? 'Selecionado: Base Tradicional (Sem Referência)' : 'Selecionar: Base Tradicional (Sem Referência)';

                        return (
                          <div className="space-y-4 pt-2">
                            <h3 className="text-sm font-serif font-black uppercase tracking-widest text-black/80">Estilo do Bolo / Referência Visual</h3>
                            <p className="text-[11px] font-semibold text-gray-500 -mt-1 leading-normal">
                              Selecione uma das fotos abaixo como modelo ou referência visual para o seu bolo personalizado. O número da foto correspondente será incluído no seu pedido!
                            </p>

                            {/* Separate "No Style Reference" Button styled like Add to Cart */}
                            <div className="w-full">
                              <button
                                type="button"
                                onClick={() => setSelectedStyleNumber(null)}
                                className={cn(
                                  "w-full py-3.5 rounded-2xl font-bold text-xs sm:text-sm shadow-sm transition-transform active:scale-[0.99] flex items-center justify-center gap-2 border-2 cursor-pointer uppercase tracking-wider",
                                  selectedStyleNumber === null
                                    ? "shadow-md text-white border-transparent"
                                    : "bg-white border-gray-200/50 hover:border-gray-300 text-black"
                                )}
                                style={{
                                  backgroundColor: selectedStyleNumber === null ? (settings.primaryColor || '#865d39') : '#ffffff',
                                  color: selectedStyleNumber === null ? getContrastText(settings.primaryColor || '#865d39') : '#000000',
                                  borderColor: settings.primaryColor || '#865d39'
                                }}
                              >
                                {selectedStyleNumber === null ? <Check size={16} /> : <X size={15} />}
                                <span>{noStyleText}</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

                              {associatedGallery?.images?.map((img, idx) => {
                                if (!img || img.trim() === '') return null;
                                const isSelected = selectedStyleNumber === (idx + 1);
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setSelectedStyleNumber(idx + 1)}
                                    className={cn(
                                      "relative aspect-square rounded-2xl overflow-hidden border-2 transition-all bg-white group p-0 text-left cursor-pointer shadow-sm hover:shadow",
                                      isSelected
                                        ? "scale-[1.01]"
                                        : "border-gray-200/50 hover:border-gray-300"
                                    )}
                                    style={{ borderColor: isSelected ? (settings.primaryColor || '#865d39') : 'transparent' }}
                                  >
                                    <img
                                      src={img}
                                      alt={`Style ${idx + 1}`}
                                      className="w-full h-full object-cover select-none"
                                      referrerPolicy="no-referrer"
                                    />
                                    {/* Number Badge */}
                                    <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-sm text-white text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full z-10">
                                      Photo {idx + 1}
                                    </div>
                                    
                                    {/* Select Highlight Overlay */}
                                    <div className={cn(
                                      "absolute inset-0 transition-opacity flex items-center justify-center p-2 text-center",
                                      isSelected 
                                        ? "bg-black/35 opacity-100" 
                                        : "bg-black/0 opacity-0 group-hover:bg-black/10 group-hover:opacity-100"
                                    )}>
                                      {isSelected ? (
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: settings.primaryColor || '#865d39', color: getContrastText(settings.primaryColor || '#865d39') }}>
                                          <Check size={18} />
                                        </div>
                                      ) : (
                                        <span className="text-[9px] font-bold text-white uppercase tracking-widest bg-black/40 px-2 py-1 rounded-full">Select</span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </>
                ) : (
                  <>
                    {/* Size Selection */}
                    {selectedProductForCustom.sizes && selectedProductForCustom.sizes.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-black">
                          {settings.language === 'en' ? 'Select Size / Portion' : 'Selecione o Tamanho / Porção'}
                        </h3>
                        <div className="space-y-2">
                          {selectedProductForCustom.sizes.map((s) => {
                            const cartItem = cart.find(item => item.productId === selectedProductForCustom.id && item.selectedSize?.id === s.id && !item.mealOptions);
                            const qty = cartItem ? cartItem.quantity : 0;
                            return (
                              <div
                                key={s.id}
                                className="flex justify-between items-center p-3.5 bg-white border border-gray-200 rounded-2xl font-bold text-black text-xs shadow-sm"
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-black">{s.name}</span>
                                  {s.price && s.price > 0 && (
                                    <span className="text-xs text-gray-500 font-extrabold mt-0.5">
                                      {currencySymbol}{s.price.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  {qty > 0 ? (
                                    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-full border border-gray-200">
                                      <button
                                        type="button"
                                        onClick={() => decrementSizeQty(selectedProductForCustom, s)}
                                        className="w-8 h-8 rounded-full bg-white hover:bg-gray-50 flex items-center justify-center text-black shadow-sm cursor-pointer active:scale-95 transition-all"
                                      >
                                        <Minus size={14} />
                                      </button>
                                      <span className="text-sm font-black min-w-[20px] text-center text-black">{qty}</span>
                                      <button
                                        type="button"
                                        onClick={() => incrementSizeQty(selectedProductForCustom, s)}
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md cursor-pointer active:scale-95 transition-all"
                                        style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => incrementSizeQty(selectedProductForCustom, s)}
                                      className="px-4 py-2 rounded-full font-bold text-xs tracking-wider uppercase shadow-md hover:scale-105 active:scale-95 cursor-pointer transition-all flex items-center gap-1"
                                      style={{ backgroundColor: settings.primaryColor || '#865d39', color: getContrastText(settings.primaryColor || '#865d39') }}
                                    >
                                      <Plus size={12} />
                                      <span>{settings.language === 'en' ? 'Add' : 'Adicionar'}</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Ingredient Exclusions */}
                    {selectedProductForCustom.isMeal && selectedProductForCustom.ingredients && (() => {
                      const ingredientsList = selectedProductForCustom.ingredients
                        .split(',')
                        .map(i => i.trim())
                        .filter(Boolean);
                      if (ingredientsList.length === 0) return null;
                      return (
                        <div className="space-y-4">
                          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: '#000000' }}>{t.excludeIngredients}</h3>
                          <div className="flex flex-wrap gap-2">
                            {ingredientsList.map((ingredient, idx) => {
                              const isSelected = mealSelections.removals.includes(ingredient);
                              return (
                                <button 
                                  key={idx}
                                  onClick={() => {
                                    if (isSelected) {
                                      setMealSelections({
                                        ...mealSelections,
                                        removals: mealSelections.removals.filter(r => r !== ingredient)
                                      });
                                    } else {
                                      setMealSelections({
                                        ...mealSelections,
                                        removals: [...mealSelections.removals, ingredient]
                                      });
                                    }
                                  }}
                                  className={cn(
                                    "px-4 py-2 rounded-full border-2 font-bold transition-all text-sm",
                                    isSelected 
                                      ? "bg-red-500 border-red-500 text-white shadow-md" 
                                      : "bg-white/50 border-transparent text-black"
                                  )}
                                >
                                  {ingredient}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Sides & Swaps Selection */}
                    {selectedProductForCustom.isMeal && selectedProductForCustom.allowedSides && selectedProductForCustom.allowedSides.length > 0 && (
                      (() => {
                        const allowedSidesList = (selectedProductForCustom.allowedSides || [])
                          .map(id => localizedSides.find(s => s.id === id))
                          .filter(Boolean) as Side[];
                        
                        const regularSides = allowedSidesList.filter(s => s.type !== 'swap');
                        const swapSides = allowedSidesList.filter(s => s.type === 'swap');

                        if (regularSides.length === 0 && swapSides.length === 0) return null;

                        const renderSideItem = (side: Side) => {
                          const qty = sideQuantities[side.id] || 0;
                          return (
                            <div 
                              key={side.id}
                              className="p-4 rounded-xl border-2 font-bold transition-all flex flex-col gap-3"
                              style={{
                                backgroundColor: qty > 0 ? theme.cardBgSolid : theme.cardBg,
                                borderColor: qty > 0 ? theme.primary : theme.primaryBorder,
                                color: theme.text,
                              }}
                            >
                              <div className="flex justify-between items-center">
                                <span style={{ color: qty > 0 ? theme.primary : theme.text }}>{side.name}</span>
                                <span className="text-xs" style={{ color: theme.textMuted }}>
                                  {side.price > 0 ? `+ ${currencySymbol}${(side.price * (qty > 0 ? qty : 1)).toFixed(2)}` : 'Free'}
                                </span>
                              </div>
                              <div className="flex items-center justify-end gap-4">
                                <button 
                                  onClick={() => setSideQuantities(prev => ({ ...prev, [side.id]: Math.max(0, (prev[side.id] || 0) - 1) }))}
                                  className="w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
                                  style={{ backgroundColor: theme.primaryTint08, color: theme.primary }}
                                >
                                  <Minus size={16} />
                                </button>
                                <span className="w-4 text-center" style={{ color: theme.text }}>{qty}</span>
                                <button 
                                  onClick={() => setSideQuantities(prev => ({ ...prev, [side.id]: (prev[side.id] || 0) + 1 }))}
                                  className="w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
                                  style={{ backgroundColor: theme.primary, color: theme.primaryContrast }}
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        };

                        return (
                          <div className="space-y-6">
                            {regularSides.length > 0 && (
                              <div className="space-y-4">
                                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.text }}>{t.chooseSides}</h3>
                                <div className="grid grid-cols-1 gap-2">
                                  {regularSides.map(renderSideItem)}
                                </div>
                              </div>
                            )}
                            {swapSides.length > 0 && (
                              <div className="space-y-4">
                                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.primary }}>
                                  Opções de Troca
                                </h3>
                                <div className="grid grid-cols-1 gap-2">
                                  {swapSides.map(renderSideItem)}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </>
                )}
              </div>

              <div className="p-6 pb-8 sm:pb-6 bg-white/30 border-t border-gray-200">
                {selectedProductForCustom && !selectedProductForCustom.isCustomSandwich && (!selectedProductForCustom.sizes || selectedProductForCustom.sizes.length === 0) && (
                  <div id="custom-modal-qty-container" className="flex items-center justify-between mb-4 bg-white/50 p-3.5 rounded-2xl border border-gray-200/50">
                    <span id="custom-modal-qty-label" className="text-sm font-bold text-black uppercase tracking-wider">
                      Quantidade
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        id="custom-modal-qty-dec-btn"
                        type="button"
                        onClick={() => {
                          const minQ = selectedProductForCustom?.minQuantity && selectedProductForCustom.minQuantity > 1 ? selectedProductForCustom.minQuantity : 1;
                          if (customItemQuantity <= minQ) {
                            if (minQ > 1) {
                              toast.info(`A quantidade mínima para este produto é de ${minQ} unidades.`);
                            }
                            return;
                          }
                          setCustomItemQuantity(prev => Math.max(minQ, prev - 1));
                        }}
                        className="w-10 h-10 rounded-full bg-white hover:bg-gray-50 flex items-center justify-center text-black border border-gray-200 shadow-sm cursor-pointer active:scale-95 transition-all text-lg font-bold"
                      >
                        <Minus size={16} />
                      </button>
                      <span id="custom-modal-qty-value" className="text-base font-black min-w-[28px] text-center text-black">{customItemQuantity}</span>
                      <button
                        id="custom-modal-qty-inc-btn"
                        type="button"
                        onClick={() => setCustomItemQuantity(prev => prev + 1)}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md cursor-pointer active:scale-95 transition-all text-lg font-bold"
                        style={{ backgroundColor: settings.primaryColor || '#865d39' }}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {(() => {
                  const isCakeIncomplete = selectedProductForCustom?.isCustomCake && (
                    (cakeSizesList.length > 0 && !selectedCakeSize) ||
                    (cakeDoughsList.length > 0 && !selectedDough) ||
                    (cakeFillingsList.length > 0 && selectedFillings.length === 0) ||
                    (cakeToppingsList.length > 0 && !selectedTopping) ||
                    (cakeToppersList.length > 0 && !selectedTopper)
                  );
                  const isSandwichIncomplete = selectedProductForCustom?.isCustomSandwich && (
                    (Object.values(sandwichFillingQuantities) as number[]).reduce((sum, q) => sum + q, 0) === 0
                  );
                  const isIncomplete = !!isCakeIncomplete || !!isSandwichIncomplete;

                  const totalQty = selectedProductForCustom?.isCustomSandwich
                    ? (Object.values(sandwichFillingQuantities) as number[]).reduce((sum, q) => sum + q, 0)
                    : customItemQuantity;

                  return (
                    <button 
                      onClick={addMealToCart}
                      disabled={isIncomplete}
                      className={`w-full py-4 rounded-2xl font-bold text-lg shadow-xl transition-all flex items-center justify-center gap-2 ${isIncomplete ? 'opacity-50 cursor-not-allowed active:scale-100' : 'active:scale-95 cursor-pointer hover:brightness-110'}`}
                      style={{ backgroundColor: settings.primaryColor || '#865d39', color: getContrastText(settings.primaryColor || '#865d39') }}
                    >
                      {isIncomplete ? (
                        <span>{isSandwichIncomplete ? 'Selecione a opção de estado da marmita' : 'Selecione todos os itens primeiro'}</span>
                      ) : (
                        <>
                          <span>{t.addToCart}</span>
                          <span className="text-sm opacity-80 font-normal">
                            ({currencySymbol} {(
                              ((selectedProductForCustom.sizes && selectedProductForCustom.sizes.length > 0 && selectedSize ? selectedSize.price : (selectedProductForCustom.price > 0 ? selectedProductForCustom.price : (selectedProductForCustom.oldPrice || 0))) + 
                              Object.entries(sideQuantities).reduce((sum, [id, qty]) => {
                                const side = sides.find(s => s.id === id);
                                return sum + (side ? side.price * (qty as number) : 0);
                              }, 0)) * totalQty
                            ).toFixed(2)})
                          </span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {renderDietsModal()}

      <InactivityGuard
        enabled={inactivityActive}
        timeoutSeconds={settings.kioskInactivitySeconds || 45}
        countdownSeconds={10}
        primaryColor={settings.primaryColor}
        glassColor={settings.glassColor}
        textColor={settings.textColor}
        language={activeLanguage}
        onResetKiosk={handleFullKioskReset}
      />
    </div>
  );

  function renderDietsModal() {
    return null;
  }
  function unused_old_modal() {
    return (
      <AnimatePresence>
        {isDietsModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDietsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-[#ece6db] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] force-dark-headings text-black"
            >
              <div className="p-6 border-b border-gray-200/50 flex items-center justify-between bg-white/40 font-serif">
                <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2" style={{ color: settings.primaryColor || '#000000' }}>
                  <Building2 size={24} />
                  {'CORPORATE & WHOLESALE'}
                </h2>
                <button 
                  onClick={() => setIsDietsModalOpen(false)} 
                  className="p-2 hover:bg-white/50 rounded-full transition-all text-black cursor-pointer"
                >
                  <X size={22} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="bg-white/50 p-4 rounded-2xl border border-white/40 space-y-2">
                  <p className="text-[11px] font-semibold leading-relaxed text-black/80">
                    💡 This is our dedicated wholesale scheduling and quote portal. Realize wholesale orders directly without retail premiums! Conditions automatically scale by volume.
                  </p>
                  
                  {isReturningB2b && (
                    <div className="flex items-center justify-between bg-[#865d39]/10 p-2.5 rounded-xl border border-[#865d39]/20 text-xs mt-1.5">
                      <span className="font-bold text-[#865d39]">✓ Returning Partner Profile Active</span>
                      <button 
                        type="button" 
                        onClick={() => {
                          localStorage.removeItem('b2b_profile_save');
                          setB2bName('');
                          setB2bResponsibleName('');
                          setB2bPhone('');
                          setB2bAddress('');
                          setIsReturningB2b(false);
                          toast.info('Profile fields cleared.');
                        }}
                        className="text-[10px] font-extrabold text-red-600 bg-white px-2 py-1 rounded-lg border border-red-200 hover:bg-red-50"
                      >
                        Reset Profile
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {/* Business Name (Nome Fantasia) with autocomplete dropdown */}
                  <div className="space-y-1 relative">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-black flex items-center gap-1.5">
                      <Building2 size={12} /> Nom Fantasie / Business Name *
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. Coffee Central or Starbucks L.A."
                      className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs outline-none text-black font-semibold shadow-sm focus:border-black transition-colors"
                      value={b2bName}
                      onChange={e => {
                        const val = e.target.value;
                        setB2bName(val);
                        if (val.trim().length >= 2) {
                          const matched = b2bProfiles.filter(p => 
                            (p.name || '').toLowerCase().includes(val.toLowerCase()) || 
                            (p.phone || '').toLowerCase().includes(val.toLowerCase())
                          );
                          setB2bSearchResults(matched);
                          setShowB2bSearchDropdown(matched.length > 0);
                        } else {
                          setShowB2bSearchDropdown(false);
                        }
                      }}
                    />
                    
                    {showB2bSearchDropdown && b2bSearchResults.length > 0 && (
                      <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto divide-y divide-gray-100 p-1">
                        <div className="text-[9px] font-bold text-gray-400 uppercase p-1.5 tracking-wider bg-gray-50/50">
                          Recurrent Profiles Found (Click to autofill):
                        </div>
                        {b2bSearchResults.map((profile, i) => (
                          <button
                            key={i}
                            type="button"
                            className="w-full p-2.5 text-left text-xs text-black hover:bg-gray-100 flex flex-col gap-0.5 rounded-lg active:scale-95 transition-all text-black font-medium"
                            onClick={() => {
                              setB2bName(profile.name || '');
                              setB2bResponsibleName(profile.manager || '');
                              setB2bPhone(profile.phone || '');
                              setB2bAddress(profile.address || '');
                              setIsReturningB2b(true);
                              setShowB2bSearchDropdown(false);
                              toast.success(`Autocompleted profile for ${profile.name}!`);
                            }}
                          >
                            <span className="font-bold text-black">{profile.name}</span>
                            <span className="text-[10px] text-gray-500 font-normal">Contact: {profile.manager} • Phone: {profile.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Responsible Person Manager Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-black flex items-center gap-1.5">
                      <User size={12} /> Responsible Manager / Contact Name *
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. John Smith"
                      className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs outline-none text-black font-semibold shadow-sm focus:border-black transition-colors"
                      value={b2bResponsibleName}
                      onChange={e => setB2bResponsibleName(e.target.value)}
                    />
                  </div>

                  {/* Contact Phone */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-black flex items-center gap-1.5">
                      <Phone size={12} /> Contact Tel / Phone *
                    </label>
                    <input 
                      type="tel" 
                      placeholder="e.g. (310) 555-0199"
                      className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs outline-none text-black font-semibold shadow-sm focus:border-black transition-colors"
                      value={b2bPhone}
                      onChange={e => setB2bPhone(e.target.value)}
                    />
                  </div>

                  {/* Delivery Address */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-black flex items-center gap-1.5">
                      <MapPin size={12} /> Commercial Delivery Address *
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. 520 Broadway, Santa Monica, CA 90401"
                      className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs outline-none text-black font-semibold shadow-sm focus:border-black transition-colors"
                      value={b2bAddress}
                      onChange={e => setB2bAddress(e.target.value)}
                    />
                  </div>

                  {/* Delivery Schedule Frequency */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-black block mb-1">
                      🚚 Delivery Plan/Frequency *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        type="button" 
                        onClick={() => setB2bFrequency('one-time')}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 ${b2bFrequency === 'one-time' ? 'bg-black text-white border-black shadow-md' : 'bg-white border-gray-300 text-black hover:border-black'}`}
                      >
                        <span>Single Delivery</span>
                        <span className="text-[9px] opacity-75 font-normal">One-time Order / Spot</span>
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setB2bFrequency('weekly')}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 ${b2bFrequency === 'weekly' ? 'bg-black text-white border-black shadow-md' : 'bg-white border-gray-300 text-black hover:border-black'}`}
                      >
                        <span className={b2bFrequency === 'weekly' ? "text-yellow-300" : "text-amber-600"}>★ Weekly Plan</span>
                        <span className="text-[9px] opacity-75 font-normal">Recurring deliveries</span>
                      </button>
                    </div>
                  </div>

                  {/* Delivery Calendar (Data de entrega) */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-black flex items-center gap-1.5">
                      <Calendar size={12} className="text-[#865d39]" /> 
                      Scheduled Delivery Date (Calendar) *
                    </label>
                    <input 
                      type="date" 
                      className="w-full p-3 rounded-xl border border-gray-300 bg-white text-xs outline-none text-black font-extrabold text-black active:border-black select-all"
                      style={{ color: '#000000' }}
                      value={b2bDate}
                      onChange={e => setB2bDate(e.target.value)}
                    />
                  </div>

                  {/* Quantity section */}
                  <div className="pt-2">
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#865d39] block mb-3 border-b border-[#865d39]/20 pb-1">
                      📦 FROZEN CHEESE BREAD PACKAGES VOLUME (1KG / 2.2LBS PACKAGES)
                    </label>
                    
                    <div className="space-y-3">
                      {/* Item 1 */}
                      <div className="bg-white/70 p-3 rounded-2xl border border-white/30 flex items-center justify-between shadow-sm hover:shadow transition-shadow">
                        <div>
                          <h4 className="font-extrabold text-xs text-black">Cocktail Size Cheese Bread</h4>
                          <p className="text-[10px] text-gray-500 font-semibold">1kg packet • bite-sized, ideal for cafes & catering</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            type="button"
                            onClick={() => setPqCoquetel(prev => Math.max(0, prev - 1))}
                            className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-black active:scale-90 transition-all font-extrabold cursor-pointer"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-6 text-center text-xs font-black text-black">{pqCoquetel}</span>
                          <button 
                            type="button"
                            onClick={() => setPqCoquetel(prev => prev + 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 hover:opacity-90 transition-all font-extrabold cursor-pointer"
                            style={{ backgroundColor: settings.primaryColor || '#865d39', color: getContrastText(settings.primaryColor || '#865d39') }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Item 2 */}
                      <div className="bg-white/70 p-3 rounded-2xl border border-white/30 flex items-center justify-between shadow-sm hover:shadow transition-shadow">
                        <div>
                          <h4 className="font-extrabold text-xs text-black">Medium Size Cheese Bread</h4>
                          <p className="text-[10px] text-gray-500 font-semibold">1kg packet • traditional classic café snack sizing</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            type="button"
                            onClick={() => setPqMedio(prev => Math.max(0, prev - 1))}
                            className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-black active:scale-90 transition-all font-extrabold cursor-pointer"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-6 text-center text-xs font-black text-black">{pqMedio}</span>
                          <button 
                            type="button"
                            onClick={() => setPqMedio(prev => prev + 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 hover:opacity-90 transition-all font-extrabold cursor-pointer"
                            style={{ backgroundColor: settings.primaryColor || '#865d39', color: getContrastText(settings.primaryColor || '#865d39') }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Item 3 */}
                      <div className="bg-white/70 p-3 rounded-2xl border border-white/30 flex items-center justify-between shadow-sm hover:shadow transition-shadow">
                        <div>
                          <h4 className="font-extrabold text-xs text-black">Large Premium Cheese Bread</h4>
                          <p className="text-[10px] text-gray-500 font-semibold">1kg packet • gourmet display-counter large size</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            type="button"
                            onClick={() => setPqPremium(prev => Math.max(0, prev - 1))}
                            className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-black active:scale-90 transition-all font-extrabold cursor-pointer"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-6 text-center text-xs font-black text-black">{pqPremium}</span>
                          <button 
                            type="button"
                            onClick={() => setPqPremium(prev => prev + 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 hover:opacity-90 transition-all font-extrabold cursor-pointer"
                            style={{ backgroundColor: settings.primaryColor || '#865d39', color: getContrastText(settings.primaryColor || '#865d39') }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Observation box */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-black">Custom Notes / Route Details</label>
                    <textarea 
                      placeholder="Enter details on delivery access, loading dock, recurring schedulings or special B2B requests"
                      rows={2.5}
                      className="w-full p-2.5 rounded-xl border border-gray-300 bg-white text-xs outline-none text-black font-semibold resize-none"
                      value={b2bObservation}
                      onChange={e => setB2bObservation(e.target.value)}
                    />
                  </div>
                </div>

                {/* Submission Options (Whats Only) */}
                <div className="pt-4 border-t border-gray-200/50 space-y-3">
                  <div className="text-[10px] font-extrabold text-center text-gray-500 uppercase tracking-widest">
                    Submit Wholesale Quote Request:
                  </div>
                  
                  <div className="w-full">
                    <button
                      type="button"
                      onClick={() => {
                        // Submit via WhatsApp
                        if (!b2bName.trim() || !b2bResponsibleName.trim() || !b2bPhone.trim() || !b2bAddress.trim() || !b2bDate) {
                           toast.error('Please complete all fields with an asterisk (*).');
                           return;
                        }
                        if (pqCoquetel === 0 && pqMedio === 0 && pqPremium === 0) {
                           toast.error('Select at least one package size quantity.');
                           return;
                        }
                        
                        // Construct state map and trigger submitting method
                        const formattedDateForDb = (() => {
                          const [year, month, day] = b2bDate.split('-');
                          return `${month}/${day}/${year}`;
                        })();

                        const orderItems = [];
                        if (pqCoquetel > 0) orderItems.push({ title: 'Cocktail Frozen Cheese Bread (1kg package)', quantity: pqCoquetel, price: 0, priceType: 'consult' as const });
                        if (pqMedio > 0) orderItems.push({ title: 'Medium Frozen Cheese Bread (1kg package)', quantity: pqMedio, price: 0, priceType: 'consult' as const });
                        if (pqPremium > 0) orderItems.push({ title: 'Large Premium Frozen Cheese Bread (1kg package)', quantity: pqPremium, price: 0, priceType: 'consult' as const });

                        const b2bOrderDataObj = {
                          customerName: b2bName,
                          phone: b2bPhone,
                          address: b2bAddress,
                          pickupDate: formattedDateForDb,
                          birthday: '',
                          observation: b2bObservation,
                          email: '',
                          items: orderItems,
                          total: 0,
                          createdAt: serverTimestamp(),
                          orderLanguage: 'en',
                          isB2B: true,
                          isPJ: true,
                          b2bManagerName: b2bResponsibleName,
                          b2bFrequency: b2bFrequency,
                          b2bCompanyName: b2bName,
                          b2bAddress: b2bAddress
                        };

                        try {
                          addDoc(collection(db, 'pedidos'), b2bOrderDataObj);
                          localStorage.setItem('b2b_profile_save', JSON.stringify({
                            name: b2bName,
                            manager: b2bResponsibleName,
                            phone: b2bPhone,
                            address: b2bAddress
                          }));
                          setIsReturningB2b(true);

                          // Build message
                          let msg = `*B2B CORPORATE ORDER & QUOTATION*\n`;
                          msg += `----------------------------------------\n`;
                          msg += `*Company:* ${b2bName}\n`;
                          msg += `*Manager:* ${b2bResponsibleName}\n`;
                          msg += `*Phone:* ${b2bPhone}\n`;
                          msg += `*Address:* ${b2bAddress}\n`;
                          msg += `*Frequency:* ${b2bFrequency === 'weekly' ? 'Weekly Recurring Plan' : 'One-Time Delivery Order'}\n`;
                          msg += `*Delivery Date:* ${formattedDateForDb}\n\n`;
                          msg += `*Wholesale items requested:*\n`;
                          if (pqCoquetel > 0) msg += `- Cocktail Frozen Cheese Bread: ${pqCoquetel} package(s) (1kg / 2.2lbs)\n`;
                          if (pqMedio > 0) msg += `- Medium Frozen Cheese Bread: ${pqMedio} package(s) (1kg / 2.2lbs)\n`;
                          if (pqPremium > 0) msg += `- Large Premium Frozen Cheese Bread: ${pqPremium} package(s) (1kg / 2.2lbs)\n`;
                          if (b2bObservation) msg += `\n*Notes/Specs:* ${b2bObservation}\n`;
                          msg += `----------------------------------------\n`;
                          msg += `Hello! We would like to request B2B wholesale pricing and delivery scheduling. Thank you!`;

                          const cleanPhone = getCleanWhatsAppPhone(settings.whatsappNumber || '', settings.whatsappCountryCode || '+55');
                          const sendUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
                          
                          toast.success('B2B Quote recorded! Redirecting to WhatsApp...');
                          setIsDietsModalOpen(false);

                          try {
                            const win = window.open(sendUrl, '_blank');
                            if (!win || win.closed || typeof win.closed === 'undefined') {
                              window.location.href = sendUrl;
                            }
                          } catch (e) {
                            window.location.href = sendUrl;
                          }
                        } catch (err) {
                          console.error(err);
                          toast.error('Error recording order.');
                        }
                      }}
                      className="w-full py-4 px-4 rounded-xl font-bold text-sm tracking-wider uppercase text-white bg-green-600 hover:bg-green-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md border-0"
                    >
                      <MessageCircle size={18} /> Enviar por WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }
}
