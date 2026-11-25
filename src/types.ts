export interface LocalizedTextEntry {
  title: string;
  description?: string;
}

export interface LocalizedTextMap {
  en?: LocalizedTextEntry;
  es?: LocalizedTextEntry;
  pt?: LocalizedTextEntry;
}

export interface Category {
  id: string;
  title: string;
  title_en?: string;
  title_es?: string;
  title_pt?: string;
  order: number;
  catalog?: 'catalog1' | 'catalog2' | 'catalog3' | 'catalog4' | 'both' | 'all' | 'catalog_b2b' | 'b2b';
  translations?: LocalizedTextMap;
}

export type PriceType = 'fixed' | 'starting' | 'consult';

export interface Side {
  id: string;
  name: string;
  title_en?: string;
  title_es?: string;
  title_pt?: string;
  price: number;
  type?: 'side' | 'swap';
  translations?: LocalizedTextMap;
}

export interface ProductSize {
  id: string;
  name: string;
  price: number;
  oldPrice?: number;
}

export interface NutritionalInfo {
  calories?: string; // Valor Energético (kcal)
  carbs?: string; // Carboidratos (g)
  carbohydrates?: string; // Carboidratos (g)
  proteins?: string; // Proteínas (g)
  totalFat?: string; // Gorduras Totais (g)
  saturatedFat?: string; // Gorduras Saturadas (g)
  transFat?: string; // Gorduras Trans (g)
  fiber?: string; // Fibra Alimentar (g)
  sodium?: string; // Sódio (mg)
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  oldPrice?: number;
  priceType?: PriceType;
  image: string; // Base64
  categoryId?: string;
  categoryTitle?: string;
  catalog?: string;
  isMeal?: boolean;
  isCustomCake?: boolean;
  ingredients?: string; // Comma separated
  allowedSides?: string[]; // IDs of sides
  isActive?: boolean;
  order?: number; // Ordem de exibição no cardápio
  hasSizes?: boolean;
  sizes?: ProductSize[];
  cakeGalleryId?: string; // Associated image gallery
  isCustomSandwich?: boolean; // Custom sandwich or tapioca with multiple fillings
  customFillings?: string; // Comma separated list of fillings
  maxFillings?: number; // Max fillings selectable when product has single price (no numbered size variation)
  fillingsRequired?: boolean; // Whether customer must pick at least 1 filling (default true)
  customFillings_en?: string;
  customFillings_es?: string;
  customFillings_pt?: string;
  nutritionalInfo?: NutritionalInfo;
  minQuantity?: number; // Quantidade mínima para pedido
  is3D?: boolean;
  isTransparent?: boolean;
  title_en?: string;
  title_es?: string;
  title_pt?: string;
  description_en?: string;
  description_es?: string;
  description_pt?: string;
  ingredients_en?: string;
  ingredients_es?: string;
  ingredients_pt?: string;
  translations?: LocalizedTextMap;
}

export interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  observation?: string;
  mealOptions?: {
    removals: string[];
    sides: Side[];
  };
  selectedSize?: ProductSize;
  cakeOptions?: {
    size?: string;
    dough?: string;
    fillings?: string[];
    topping?: string;
    topper?: string;
    styleNumber?: number; // Selected image style number from gallery
  };
  sandwichOptions?: {
    fillings: string[];
  };
}

export type TerminalProvider = 'square' | 'zettle' | 'simulation';
export type OnlinePaymentProvider = 'paypal' | 'venmo' | 'square_web' | 'simulation';
export type OrderModality = 'dine_in' | 'takeout';
export type OrderSource = 'totem' | 'mobile_pickup' | 'kiosk' | 'manual' | 'online';
export type PickupType = 'asap' | 'scheduled';
export type KitchenStatus = 'preparing' | 'ready' | 'completed';

export interface OrderItem {
  title: string;
  quantity: number;
  price: number;
  priceType?: PriceType;
  isCustomItem?: boolean;
  observation?: string;
  mealOptions?: {
    removals: string[];
    sides: Side[];
  };
  selectedSize?: ProductSize;
  cakeOptions?: {
    size?: string;
    dough?: string;
    fillings?: string[];
    topping?: string;
    topper?: string;
    styleNumber?: number;
  };
  sandwichOptions?: {
    fillings: string[];
  };
}

export interface Order {
  id: string;
  orderNumber?: number;
  customerName: string;
  tableOrPager?: string;
  orderType?: OrderModality;
  phone: string;
  address: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  zipCode?: string;
  city?: string;
  state?: string;
  deliveryType?: 'delivery' | 'pickup';
  deliveryFee?: number;
  deliveryDistanceKm?: number;
  pickupDate?: string;
  pickupTime?: string;
  birthday: string;
  observation: string;
  email: string;
  isB2B?: boolean;
  isPJ?: boolean;
  b2bCompanyName?: string;
  b2bAddress?: string;
  b2bManagerName?: string;
  b2bZipCode?: string;
  b2bCity?: string;
  b2bFrequency?: string;
  b2bDate?: string;
  items: OrderItem[];
  total: number;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  tipAmount?: number;
  tipPercent?: number;
  createdAt: any;
  readyAt?: any;
  orderLanguage?: string;
  paymentStatus?: 'pending' | 'half' | 'full' | 'paid' | 'awaiting_payment' | 'manual_verification';
  paymentProvider?: TerminalProvider | 'venmo' | 'paypal' | 'cashapp' | 'zelle' | 'counter' | 'demo';
  paymentConfirmedAt?: any;
  webhookSecretVerified?: string;
  onlinePaymentProvider?: OnlinePaymentProvider;
  paymentTransactionId?: string;
  kitchenStatus?: KitchenStatus;
  source?: 'kiosk' | 'manual' | 'online';
  orderSource?: OrderSource;
  pickupType?: PickupType;
  scheduledTime?: string;
  pickupSchedule?: string;
}

export interface ImageGallery {
  id: string;
  title: string;
  name?: string;
  images: string[]; // maximum 6 base64 images
}

export interface DeliveryRange {
  id: string;
  maxKm: number;
  price: number;
}

export interface Settings {
  logo: string;
  primaryColor: string;
  whatsappNumber: string;
  whatsappCountryCode?: string;
  slug: string;
  brandName: string;
  adminPassword?: string;
  slogan?: string;
  whatsappClosingMessage?: string;
  backgroundImage?: string;
  glassColor?: string;
  textColor?: string;
  categoryTextColor?: string;
  brandTextColor?: string;
  priceColor?: string;
  detailsColor?: string;
  productTitleColor?: string;
  productDescColor?: string;
  sloganColor?: string;
  badgeColor?: string;
  minOrderValue?: number;
  minOrderEnabled?: boolean;
  language?: 'pt' | 'en' | 'es';
  currency?: 'BRL' | 'USD' | 'EUR' | string;
  checkoutTitle?: string;
  infoBlock1Title?: string;
  infoBlock1Text?: string;
  infoBlock2Title?: string;
  infoBlock2Text?: string;
  // Easy Totem USA Edition Kiosk Settings
  salesTaxRate?: number;
  terminalProvider?: TerminalProvider;
  terminalApiKey?: string;
  terminalDeviceId?: string;
  kioskPrinterName?: string;
  kitchenPrinterName?: string;
  askTableOrPager?: boolean;
  kioskInactivitySeconds?: number;
  // Easy Kioski QR Code & Email Auto-Confirmation (Totem Only)
  venmoUsername?: string;
  paypalMeUsername?: string;
  cashAppTag?: string;
  allowPayAtCounter?: boolean;
  emailWebhookSecret?: string;
  totemDemoMode?: boolean;
  // Mobile Pickup (External App Mode) Settings
  defaultPrepMinutes?: number;
  pickupOpenTime?: string; // HH:mm e.g. '09:00'
  pickupCloseTime?: string; // HH:mm e.g. '21:00'
  pickupSlotIntervalMinutes?: number; // e.g. 15
  zelleIdentifier?: string; // Optional Zelle email or US phone for advance mobile pickup orders
  mobilePickupRequirePaidForKds?: boolean; // Default true: only send to KDS/printer after payment confirmed
  onlinePaymentProvider?: OnlinePaymentProvider;
  onlinePaymentMerchantId?: string;
  // Intro screen settings & localized translations
  introEnabled?: boolean;
  introTitle?: string;
  introSubtitle?: string;
  introSubtitle_en?: string;
  introSubtitle_es?: string;
  introSubtitle_pt?: string;
  introDescription?: string;
  introDescription_en?: string;
  introDescription_es?: string;
  introDescription_pt?: string;
  introButtonText?: string;
  introButtonText_en?: string;
  introButtonText_es?: string;
  introButtonText_pt?: string;
  introBottomText?: string;
  introBottomText_en?: string;
  introBottomText_es?: string;
  introBottomText_pt?: string;
  slogan_en?: string;
  slogan_es?: string;
  slogan_pt?: string;
  // Catalog selector settings
  selectorEnabled?: boolean;
  selectorTitle?: string;
  selectorSubtitle?: string;
  catalog1Title?: string;
  catalog1Title_en?: string;
  catalog1Title_es?: string;
  catalog1Title_pt?: string;
  catalog1Image?: string;
  catalog1Desc?: string;
  catalog1Desc_en?: string;
  catalog1Desc_es?: string;
  catalog1Desc_pt?: string;
  catalog1Slogan?: string;
  catalog1Slogan_en?: string;
  catalog1Slogan_es?: string;
  catalog1Slogan_pt?: string;
  catalog1Active?: boolean;
  catalog2Title?: string;
  catalog2Image?: string;
  catalog2Desc?: string;
  catalog2Slogan?: string;
  catalog2Active?: boolean;
  catalog3Title?: string;
  catalog3Image?: string;
  catalog3Desc?: string;
  catalog3Slogan?: string;
  catalog3Active?: boolean;
  catalog4Title?: string;
  catalog4Image?: string;
  catalog4Desc?: string;
  catalog4Slogan?: string;
  catalog4Active?: boolean;
  // Custom Cake settings
  cakeSizes?: string[];
  cakeDoughs?: string[];
  cakeFillings?: string[];
  cakeFillingsMax?: number;
  cakeToppings?: string[];
  cakeToppers?: string[];
  // Fixed costs configurations
  fixedRent?: number;
  fixedInternet?: number;
  fixedElectricity?: number;
  fixedWater?: number;
  fixedGas?: number;
  fixedSistemas?: number;
  fixedMarketing?: number;
  fixedContabilidade?: number;
  fixedSalarios?: number;
  fixedMei?: number;
  customFixedCosts?: { label: string; amount: number }[];
  // Configuração de Entrega / Frete por KM
  deliveryEnabled?: boolean;
  deliveryOriginAddress?: string;
  deliveryOriginLat?: number;
  deliveryOriginLng?: number;
  deliveryRanges?: DeliveryRange[];
  deliveryPricePerKmExtra?: number;
  deliveryMaxKm?: number;
  deliveryFallbackPrice?: number;
  deliveryFreeAbove?: number;
  allowPickup?: boolean;
  // Botões do rodapé (ex: Eventos e Mentoria)
  footerButtonsEnabled?: boolean;
  footerBtn1Enabled?: boolean;
  footerBtn1Label?: string;
  footerBtn1Image?: string;
  footerBtn2Enabled?: boolean;
  footerBtn2Label?: string;
  footerBtn2Image?: string;
}

export interface VariableCost {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
}

export interface Insumo {
  id: string;
  title: string;
  description?: string;
  image: string;
  link: string;
  category?: string;
  createdAt?: any;
}
