import { getCurrencySymbol } from './countryUtils';

export type KioskLanguage = 'en' | 'es' | 'pt';

export const formatMoney = (amount: number | undefined | null, currency: string = 'USD'): string => {
  const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const symbol = getCurrencySymbol(currency);
  if (currency === 'USD') {
    return `${symbol}${safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === 'EUR') {
    return `${symbol}${safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${symbol} ${safe.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export interface KioskDictionary {
  // Intro & Navigation
  startOrder: string;
  loadingCatalog: string;
  noProductsFound: string;
  chooseExperience: string;
  moreMenus: string;
  // Product Card & Details
  startingAt: string;
  onRequest: string;
  add: string;
  customize: string;
  inOrder: string;
  addToBag: string;
  chooseSize: string;
  chooseModel: string;
  chooseDough: string;
  chooseFillings: string;
  chooseFrosting: string;
  chooseSides: string;
  excludeIngredients: string;
  limitReached: string;
  customCakeTitle: string;
  addedToOrder: string;
  minQtyToast: (title: string, qty: number) => string;
  // Cart Bar & Review
  viewOrder: string;
  itemSingular: string;
  itemPlural: string;
  cartTitle: string;
  emptyCartTitle: string;
  emptyCartDesc: string;
  backToMenu: string;
  addMoreItems: string;
  continueCheckout: string;
  minOrderLabel: string;
  minOrderMissing: string;
  // Step 1: Modality
  stepModalityTitle: string;
  stepModalitySubtitle: string;
  dineIn: string;
  dineInDesc: string;
  takeout: string;
  takeoutDesc: string;
  firstNameLabel: string;
  firstNamePlaceholder: string;
  firstNameRequired: string;
  tableOrPagerLabel: string;
  tableOrPagerPlaceholder: string;
  orderNoteLabel: string;
  orderNotePlaceholder: string;
  continueToTip: string;
  // Step 2: Tip Screen
  stepTipTitle: string;
  stepTipSubtitle: string;
  customTip: string;
  customTipPlaceholder: string;
  noTip: string;
  subtotal: string;
  salesTax: string;
  tip: string;
  total: string;
  proceedToPayment: string;
  // Step 3: Payment Terminal
  stepPaymentTitle: string;
  tapInsertSwipe: string;
  acceptedMethods: string;
  waitingReader: string;
  processingPayment: string;
  simulatePaymentBtn: string;
  cancelPayment: string;
  // Step 4: Confirmed
  orderConfirmedTitle: string;
  yourOrderNumber: string;
  paidBadge: string;
  printingReceipts: string;
  receiptsPrinted: string;
  previewPrintReceipts: string;
  startNewOrder: string;
  autoResetNotice: (seconds: number) => string;
  // Inactivity
  stillOrderingTitle: string;
  stillOrderingDesc: string;
  keepOrderingBtn: string;
  startOverBtn: string;
  // Common
  back: string;
  close: string;
  excludeLabel: string;
  sidesLabel: string;
  swapsLabel: string;
  detailsBtn: string;
  translatingMenu: string;
  // Mobile Pickup & PWA Install Banner
  mobilePickupBadge: string;
  mobilePickupIntroBottom: string;
  pwaBannerTitle: string;
  pwaBannerSubtitle: string;
  pwaBannerInstallBtn: string;
  pwaBannerHowToBtn: string;
  pwaModalTitle: string;
  pwaIosLabel: string;
  pwaIosStep1: string;
  pwaIosStep2: string;
  pwaAndroidLabel: string;
  pwaAndroidStep1: string;
  pwaAndroidStep2: string;
  pwaGotIt: string;
  // Mobile Pickup Checkout
  pickupStepTitle: string;
  pickupStepSubtitle: string;
  pickupAsapTitle: string;
  pickupAsapDesc: (mins: number) => string;
  pickupScheduleTitle: string;
  pickupScheduleDesc: string;
  pickupDateLabel: string;
  pickupTimeSlotLabel: string;
  pickupNoSlotsToday: string;
  fullNameLabel: string;
  fullNamePlaceholder: string;
  fullNameRequired: string;
  mobilePhoneLabel: string;
  mobilePhonePlaceholder: string;
  mobilePhoneRequired: string;
  onlinePaymentTitle: string;
  onlinePaymentSubtitle: string;
  choosePaymentMethod: string;
  payWithMethodBtn: (method: string, amount: string) => string;
  authorizingOnlinePayment: string;
  mobileOrderConfirmedSubtitle: string;
  pickupTimeSummaryLabel: string;
  pickupReadyAsap: (mins: number) => string;
  orderMoreItemsBtn: string;
}

export const KIOSK_TRANSLATIONS: Record<KioskLanguage, KioskDictionary> = {
  en: {
    startOrder: 'TAP TO ORDER',
    loadingCatalog: 'Loading menu...',
    noProductsFound: 'No items available right now.',
    chooseExperience: 'Choose your menu',
    moreMenus: 'More Menus',
    startingAt: 'From',
    onRequest: 'Ask Staff',
    add: 'Add',
    customize: 'Customize',
    inOrder: 'in bag',
    addToBag: 'ADD TO ORDER',
    chooseSize: 'Choose Size',
    chooseModel: 'Choose Style',
    chooseDough: 'Choose Base / Dough',
    chooseFillings: 'Choose Fillings',
    chooseFrosting: 'Choose Topping',
    chooseSides: 'Choose Add-ons & Sides',
    excludeIngredients: 'Remove Ingredients',
    limitReached: 'Limit reached',
    customCakeTitle: 'Customize Your Item',
    addedToOrder: 'Added to your order',
    minQtyToast: (title, qty) => `Minimum quantity for "${title}" is ${qty}.`,
    viewOrder: 'Review Order',
    itemSingular: 'item',
    itemPlural: 'items',
    cartTitle: 'Your Order',
    emptyCartTitle: 'Your bag is empty',
    emptyCartDesc: 'Select items from the menu to start your order.',
    backToMenu: 'Back to Menu',
    addMoreItems: 'Add More Items',
    continueCheckout: 'Continue to Checkout',
    minOrderLabel: 'Minimum order',
    minOrderMissing: 'Remaining',
    stepModalityTitle: 'How will you enjoy your order?',
    stepModalitySubtitle: 'Select dining preference and enter your first name for pickup.',
    dineIn: 'DINE-IN',
    dineInDesc: 'Enjoy fresh at our tables',
    takeout: 'TAKEOUT / TO-GO',
    takeoutDesc: 'Packed to carry out',
    firstNameLabel: 'First Name',
    firstNamePlaceholder: 'e.g. Alex',
    firstNameRequired: 'Please enter your first name so we can call your order.',
    tableOrPagerLabel: 'Table or Pager Number (Optional)',
    tableOrPagerPlaceholder: 'e.g. Table 12 or Pager #4',
    orderNoteLabel: 'Special Instructions (Optional)',
    orderNotePlaceholder: 'Allergies, extra napkins, utensils...',
    continueToTip: 'Continue',
    stepTipTitle: 'Would you like to leave a tip?',
    stepTipSubtitle: '100% of tips go directly to our team.',
    customTip: 'Custom Tip',
    customTipPlaceholder: '0.00',
    noTip: 'No Tip',
    subtotal: 'Subtotal',
    salesTax: 'Sales Tax',
    tip: 'Tip',
    total: 'Total',
    proceedToPayment: 'Pay Now',
    stepPaymentTitle: 'Complete Payment',
    tapInsertSwipe: 'Please tap, insert, or swipe your card on the reader below',
    acceptedMethods: 'Apple Pay · Google Pay · Contactless · EMV Chip',
    waitingReader: 'Waiting for payment terminal...',
    processingPayment: 'Authorizing transaction...',
    simulatePaymentBtn: 'Simulate Approved Payment',
    cancelPayment: 'Cancel & Go Back',
    orderConfirmedTitle: 'Thank You!',
    yourOrderNumber: 'ORDER NUMBER',
    paidBadge: 'PAID',
    printingReceipts: 'Printing customer receipt & kitchen ticket...',
    receiptsPrinted: 'Receipt & kitchen ticket sent to printers.',
    previewPrintReceipts: 'View / Print 80mm Receipts',
    startNewOrder: 'Start New Order',
    autoResetNotice: (s) => `Returning to welcome screen in ${s}s`,
    stillOrderingTitle: 'Are you still ordering?',
    stillOrderingDesc: 'Tap below to continue your order, or this kiosk will reset automatically.',
    keepOrderingBtn: 'Yes, Keep Ordering',
    startOverBtn: 'Start Over',
    back: 'Back',
    close: 'Close',
    excludeLabel: 'No',
    sidesLabel: 'Add',
    swapsLabel: 'Swap',
    detailsBtn: '+ Details',
    translatingMenu: 'Translating menu...',
    mobilePickupBadge: 'MOBILE PICKUP',
    mobilePickupIntroBottom: 'MOBILE PICKUP · SKIP THE LINE',
    pwaBannerTitle: 'Add to Home Screen for faster pickup orders',
    pwaBannerSubtitle: 'Install our web app for one-tap reordering.',
    pwaBannerInstallBtn: 'Install App',
    pwaBannerHowToBtn: 'How to Add',
    pwaModalTitle: 'Add to Home Screen',
    pwaIosLabel: 'iPhone / Safari',
    pwaIosStep1: 'Tap the Share icon at the bottom of Safari.',
    pwaIosStep2: 'Scroll down and tap "Add to Home Screen".',
    pwaAndroidLabel: 'Android / Chrome',
    pwaAndroidStep1: 'Tap the menu icon (⋮) in the top right.',
    pwaAndroidStep2: 'Tap "Add to Home screen" or "Install app".',
    pwaGotIt: 'Got It',
    pickupStepTitle: 'When would you like to pick up?',
    pickupStepSubtitle: 'Choose ASAP or schedule a pickup window and add your contact details.',
    pickupAsapTitle: 'ASAP',
    pickupAsapDesc: (mins) => `Ready in ~${mins} mins`,
    pickupScheduleTitle: 'Schedule Pickup',
    pickupScheduleDesc: 'Pick a date & time window',
    pickupDateLabel: 'Pickup Date (MM/DD/YYYY)',
    pickupTimeSlotLabel: 'Pickup Time',
    pickupNoSlotsToday: 'No more pickup windows available today. Please select tomorrow.',
    fullNameLabel: 'First & Last Name',
    fullNamePlaceholder: 'e.g. Alex Morgan',
    fullNameRequired: 'Please enter your first and last name.',
    mobilePhoneLabel: 'Mobile Phone (SMS / WhatsApp)',
    mobilePhonePlaceholder: '(555) 123-4567',
    mobilePhoneRequired: 'Please enter a valid mobile phone number for pickup updates.',
    onlinePaymentTitle: 'Online Mobile Payment',
    onlinePaymentSubtitle: 'Secure checkout to send your order directly to our kitchen.',
    choosePaymentMethod: 'Select Payment Method',
    payWithMethodBtn: (method, amount) => `Pay ${amount} with ${method}`,
    authorizingOnlinePayment: 'Confirming online payment...',
    mobileOrderConfirmedSubtitle: 'Your order is confirmed and sent directly to our kitchen.',
    pickupTimeSummaryLabel: 'PICKUP WINDOW',
    pickupReadyAsap: (mins) => `ASAP (~${mins} min)`,
    orderMoreItemsBtn: 'Place Another Order',
  },
  es: {
    startOrder: 'TOCAR PARA ORDENAR',
    loadingCatalog: 'Cargando menú...',
    noProductsFound: 'No hay productos disponibles.',
    chooseExperience: 'Elige tu menú',
    moreMenus: 'Más Menús',
    startingAt: 'Desde',
    onRequest: 'Consultar',
    add: 'Agregar',
    customize: 'Personalizar',
    inOrder: 'en pedido',
    addToBag: 'AGREGAR AL PEDIDO',
    chooseSize: 'Elige el Tamaño',
    chooseModel: 'Elige el Estilo',
    chooseDough: 'Elige la Masa',
    chooseFillings: 'Elige los Rellenos',
    chooseFrosting: 'Elige la Cobertura',
    chooseSides: 'Extras y Acompañamientos',
    excludeIngredients: 'Quitar Ingredientes',
    limitReached: 'Límite alcanzado',
    customCakeTitle: 'Personaliza tu Pedido',
    addedToOrder: 'Agregado a tu pedido',
    minQtyToast: (title, qty) => `La cantidad mínima para "${title}" es ${qty}.`,
    viewOrder: 'Ver Pedido',
    itemSingular: 'artículo',
    itemPlural: 'artículos',
    cartTitle: 'Tu Pedido',
    emptyCartTitle: 'Tu pedido está vacío',
    emptyCartDesc: 'Selecciona productos del menú para comenzar.',
    backToMenu: 'Volver al Menú',
    addMoreItems: 'Agregar Más Artículos',
    continueCheckout: 'Continuar al Pago',
    minOrderLabel: 'Pedido mínimo',
    minOrderMissing: 'Faltan',
    stepModalityTitle: '¿Dónde disfrutarás tu pedido?',
    stepModalitySubtitle: 'Selecciona una opción e ingresa tu nombre para llamarte.',
    dineIn: 'COMER AQUÍ',
    dineInDesc: 'Servido para disfrutar en mesa',
    takeout: 'PARA LLEVAR',
    takeoutDesc: 'Empacado listo para llevar',
    firstNameLabel: 'Tu Nombre',
    firstNamePlaceholder: 'Ej. María',
    firstNameRequired: 'Por favor ingresa tu nombre para llamar tu pedido.',
    tableOrPagerLabel: 'Mesa o Localizador (Opcional)',
    tableOrPagerPlaceholder: 'Ej. Mesa 12 o #4',
    orderNoteLabel: 'Instrucciones Especiales (Opcional)',
    orderNotePlaceholder: 'Alergias, cubiertos, servilletas...',
    continueToTip: 'Continuar',
    stepTipTitle: '¿Deseas agregar propina?',
    stepTipSubtitle: 'El 100% de la propina va directo a nuestro equipo.',
    customTip: 'Propina Personalizada',
    customTipPlaceholder: '0.00',
    noTip: 'Sin Propina',
    subtotal: 'Subtotal',
    salesTax: 'Impuesto (Sales Tax)',
    tip: 'Propina',
    total: 'Total',
    proceedToPayment: 'Pagar Ahora',
    stepPaymentTitle: 'Completar Pago',
    tapInsertSwipe: 'Por favor acerca, inserta o desliza tu tarjeta en el lector',
    acceptedMethods: 'Apple Pay · Google Pay · Sin Contacto · Chip EMV',
    waitingReader: 'Esperando al terminal de pago...',
    processingPayment: 'Autorizando transacción...',
    simulatePaymentBtn: 'Simular Pago Aprobado',
    cancelPayment: 'Cancelar y Volver',
    orderConfirmedTitle: '¡Gracias!',
    yourOrderNumber: 'NÚMERO DE PEDIDO',
    paidBadge: 'PAGADO',
    printingReceipts: 'Imprimiendo recibo y comanda de cocina...',
    receiptsPrinted: 'Recibo y comanda enviados a las impresoras.',
    previewPrintReceipts: 'Ver / Imprimir Tickets 80mm',
    startNewOrder: 'Nuevo Pedido',
    autoResetNotice: (s) => `Volviendo al inicio en ${s}s`,
    stillOrderingTitle: '¿Sigues ordenando?',
    stillOrderingDesc: 'Toca abajo para continuar, o el kiosco se reiniciará automáticamente.',
    keepOrderingBtn: 'Sí, Continuar',
    startOverBtn: 'Empezar de Nuevo',
    back: 'Volver',
    close: 'Cerrar',
    excludeLabel: 'Sin',
    sidesLabel: 'Extra',
    swapsLabel: 'Cambio',
    detailsBtn: '+ Detalles',
    translatingMenu: 'Traduciendo menú...',
    mobilePickupBadge: 'RETIRO MÓVIL',
    mobilePickupIntroBottom: 'RETIRO EN TIENDA · SIN FILAS',
    pwaBannerTitle: 'Añade a tu pantalla de inicio para pedidos más rápidos',
    pwaBannerSubtitle: 'Instala nuestra app web para ordenar en un toque.',
    pwaBannerInstallBtn: 'Instalar App',
    pwaBannerHowToBtn: 'Cómo Añadir',
    pwaModalTitle: 'Añadir a Pantalla de Inicio',
    pwaIosLabel: 'iPhone / Safari',
    pwaIosStep1: 'Toca el botón Compartir en la parte inferior de Safari.',
    pwaIosStep2: 'Desliza y toca "Añadir a pantalla de inicio".',
    pwaAndroidLabel: 'Android / Chrome',
    pwaAndroidStep1: 'Toca el menú (⋮) en la esquina superior derecha.',
    pwaAndroidStep2: 'Toca "Añadir a pantalla de inicio" o "Instalar app".',
    pwaGotIt: 'Entendido',
    pickupStepTitle: '¿Cuándo deseas retirar tu pedido?',
    pickupStepSubtitle: 'Elige Lo Antes Posible o programa un horario e ingresa tus datos.',
    pickupAsapTitle: 'LO ANTES POSIBLE',
    pickupAsapDesc: (mins) => `Listo en ~${mins} min`,
    pickupScheduleTitle: 'Programar Retiro',
    pickupScheduleDesc: 'Elige fecha y horario',
    pickupDateLabel: 'Fecha de Retiro (MM/DD/AAAA)',
    pickupTimeSlotLabel: 'Horario de Retiro',
    pickupNoSlotsToday: 'No quedan horarios hoy. Por favor elige mañana.',
    fullNameLabel: 'Nombre y Apellido',
    fullNamePlaceholder: 'Ej. María López',
    fullNameRequired: 'Por favor ingresa tu nombre y apellido.',
    mobilePhoneLabel: 'Celular (SMS / WhatsApp)',
    mobilePhonePlaceholder: '(555) 123-4567',
    mobilePhoneRequired: 'Por favor ingresa un número de celular válido.',
    onlinePaymentTitle: 'Pago Móvil en Línea',
    onlinePaymentSubtitle: 'Pago seguro para enviar tu pedido directo a nuestra cocina.',
    choosePaymentMethod: 'Selecciona el Método de Pago',
    payWithMethodBtn: (method, amount) => `Pagar ${amount} con ${method}`,
    authorizingOnlinePayment: 'Confirmando pago en línea...',
    mobileOrderConfirmedSubtitle: 'Tu pedido está confirmado y ya fue enviado a nuestra cocina.',
    pickupTimeSummaryLabel: 'HORARIO DE RETIRO',
    pickupReadyAsap: (mins) => `ASAP (~${mins} min)`,
    orderMoreItemsBtn: 'Hacer Otro Pedido',
  },
  pt: {
    startOrder: 'TOQUE PARA PEDIR',
    loadingCatalog: 'Carregando cardápio...',
    noProductsFound: 'Nenhum produto encontrado.',
    chooseExperience: 'Escolha seu cardápio',
    moreMenus: 'Mais Cardápios',
    startingAt: 'A partir de',
    onRequest: 'A Consultar',
    add: 'Adicionar',
    customize: 'Personalizar',
    inOrder: 'no pedido',
    addToBag: 'ADICIONAR AO PEDIDO',
    chooseSize: 'Escolha o Tamanho',
    chooseModel: 'Escolha o Modelo',
    chooseDough: 'Escolha a Massa',
    chooseFillings: 'Escolha os Recheios',
    chooseFrosting: 'Escolha a Cobertura',
    chooseSides: 'Extras e Acompanhamentos',
    excludeIngredients: 'Remover Ingredientes',
    limitReached: 'Limite atingido',
    customCakeTitle: 'Personalize seu Item',
    addedToOrder: 'Adicionado ao pedido',
    minQtyToast: (title, qty) => `A quantidade mínima para "${title}" é ${qty}.`,
    viewOrder: 'Ver Pedido',
    itemSingular: 'item',
    itemPlural: 'itens',
    cartTitle: 'Seu Pedido',
    emptyCartTitle: 'Seu carrinho está vazio',
    emptyCartDesc: 'Escolha os produtos do cardápio para iniciar seu pedido.',
    backToMenu: 'Voltar ao Cardápio',
    addMoreItems: 'Adicionar Mais Itens',
    continueCheckout: 'Ir para o Pagamento',
    minOrderLabel: 'Pedido mínimo',
    minOrderMissing: 'Faltam',
    stepModalityTitle: 'Como deseja seu pedido?',
    stepModalitySubtitle: 'Escolha a modalidade e informe seu primeiro nome para retirada.',
    dineIn: 'COMER NO LOCAL',
    dineInDesc: 'Servido para consumo no salão',
    takeout: 'PARA VIAGEM',
    takeoutDesc: 'Embalado pronto para levar',
    firstNameLabel: 'Primeiro Nome',
    firstNamePlaceholder: 'Ex: Ana',
    firstNameRequired: 'Por favor, informe seu nome para chamarmos seu pedido.',
    tableOrPagerLabel: 'Mesa ou Pager (Opcional)',
    tableOrPagerPlaceholder: 'Ex: Mesa 12 ou Pager #4',
    orderNoteLabel: 'Observações (Opcional)',
    orderNotePlaceholder: 'Alergias, talheres, ponto...',
    continueToTip: 'Continuar',
    stepTipTitle: 'Deseja adicionar gorjeta?',
    stepTipSubtitle: '100% da gorjeta vai diretamente para nossa equipe.',
    customTip: 'Outro Valor',
    customTipPlaceholder: '0.00',
    noTip: 'Sem Gorjeta',
    subtotal: 'Subtotal',
    salesTax: 'Sales Tax',
    tip: 'Gorjeta (Tip)',
    total: 'Total',
    proceedToPayment: 'Pagar Agora',
    stepPaymentTitle: 'Finalizar Pagamento',
    tapInsertSwipe: 'Aproxime, insira ou passe seu cartão na maquininha abaixo',
    acceptedMethods: 'Apple Pay · Google Pay · Aproximação · Chip',
    waitingReader: 'Aguardando terminal de pagamento...',
    processingPayment: 'Autorizando pagamento...',
    simulatePaymentBtn: 'Simular Pagamento Aprovado',
    cancelPayment: 'Cancelar e Voltar',
    orderConfirmedTitle: 'Pedido Confirmado!',
    yourOrderNumber: 'SENHA DO PEDIDO',
    paidBadge: 'PAGO',
    printingReceipts: 'Imprimindo via cliente e comanda da cozinha...',
    receiptsPrinted: 'Via do cliente e comanda enviadas às impressoras.',
    previewPrintReceipts: 'Ver / Imprimir Vias 80mm',
    startNewOrder: 'Fazer Novo Pedido',
    autoResetNotice: (s) => `Reiniciando tela inicial em ${s}s`,
    stillOrderingTitle: 'Você ainda está pedindo?',
    stillOrderingDesc: 'Toque abaixo para continuar, ou o totem será reiniciado automaticamente.',
    keepOrderingBtn: 'Sim, Continuar Pedido',
    startOverBtn: 'Recomeçar',
    back: 'Voltar',
    close: 'Fechar',
    excludeLabel: 'Sem',
    sidesLabel: 'Extra',
    swapsLabel: 'Troca',
    detailsBtn: '+ Detalhes',
    translatingMenu: 'Traduzindo cardápio...',
    mobilePickupBadge: 'RETIRADA MOBILE',
    mobilePickupIntroBottom: 'RETIRADA AGENDADA · SEM FILA',
    pwaBannerTitle: 'Adicione à tela inicial para pedir mais rápido',
    pwaBannerSubtitle: 'Instale nosso app para fazer pedidos de retirada com um toque.',
    pwaBannerInstallBtn: 'Instalar App',
    pwaBannerHowToBtn: 'Como Adicionar',
    pwaModalTitle: 'Adicionar à Tela Inicial',
    pwaIosLabel: 'iPhone / Safari',
    pwaIosStep1: 'Toque no ícone Compartilhar na barra inferior do Safari.',
    pwaIosStep2: 'Role para baixo e toque em "Adicionar à Tela de Início".',
    pwaAndroidLabel: 'Android / Chrome',
    pwaAndroidStep1: 'Toque no menu (⋮) no canto superior direito.',
    pwaAndroidStep2: 'Toque em "Adicionar à tela inicial" ou "Instalar app".',
    pwaGotIt: 'Entendi',
    pickupStepTitle: 'Quando você quer retirar seu pedido?',
    pickupStepSubtitle: 'Escolha o mais rápido possível ou agende data e horário de retirada.',
    pickupAsapTitle: 'O MAIS RÁPIDO (ASAP)',
    pickupAsapDesc: (mins) => `Pronto em ~${mins} min`,
    pickupScheduleTitle: 'Agendar Retirada',
    pickupScheduleDesc: 'Escolha data e horário',
    pickupDateLabel: 'Data de Retirada (MM/DD/AAAA)',
    pickupTimeSlotLabel: 'Horário de Retirada',
    pickupNoSlotsToday: 'Não há mais horários hoje. Selecione amanhã.',
    fullNameLabel: 'Nome e Sobrenome',
    fullNamePlaceholder: 'Ex: Ana Silva',
    fullNameRequired: 'Por favor, informe seu nome e sobrenome.',
    mobilePhoneLabel: 'Celular (SMS / WhatsApp)',
    mobilePhonePlaceholder: '(555) 123-4567',
    mobilePhoneRequired: 'Por favor, informe um número de celular válido.',
    onlinePaymentTitle: 'Pagamento Online no Celular',
    onlinePaymentSubtitle: 'Finalize online para enviar seu pedido direto à cozinha.',
    choosePaymentMethod: 'Escolha a Forma de Pagamento',
    payWithMethodBtn: (method, amount) => `Pagar ${amount} com ${method}`,
    authorizingOnlinePayment: 'Confirmando pagamento online...',
    mobileOrderConfirmedSubtitle: 'Seu pedido está confirmado e já foi enviado para nossa cozinha.',
    pickupTimeSummaryLabel: 'HORÁRIO DE RETIRADA',
    pickupReadyAsap: (mins) => `ASAP (~${mins} min)`,
    orderMoreItemsBtn: 'Fazer Novo Pedido',
  }
};

export const getKioskDict = (lang?: string): KioskDictionary => {
  if (lang === 'es') return KIOSK_TRANSLATIONS.es;
  if (lang === 'pt') return KIOSK_TRANSLATIONS.pt;
  return KIOSK_TRANSLATIONS.en;
};
