import React, { useState, useEffect, ErrorInfo, ReactNode } from 'react';
import Menu from './components/Menu';
import Admin from './components/Admin';
import Footer from './components/Footer';
import { KDSView } from './components/KDSView';
import { CashierView } from './components/CashierView';
import { SecretAdminModal } from './components/SecretAdminModal';
import { TotemScreensaverOverlay } from './screensaver/TotemScreensaverOverlay';
import { db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Settings } from './types';
import { Toaster } from 'sonner';
import { Maximize2 } from 'lucide-react';
import { DEFAULT_TOTEM_SETTINGS, ensureInitialCatalogSeed } from './services/catalogSeedService';
import { getBrandTheme } from './utils/brandTheme';
import {
  sanitizeCashAppTag,
  sanitizePaypalUsername,
  sanitizeVenmoUsername,
} from './services/appsScriptGenerator';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen w-full flex items-center justify-center p-6 text-gray-900"
          style={{ backgroundColor: 'var(--surface-color, #ffffff)' }}
        >
          <div className="bg-white/95 backdrop-blur-md p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-4 border border-black/10">
            <h2 className="text-2xl font-serif font-bold text-red-600">Something went wrong</h2>
            <p className="text-sm text-gray-600">
              {this.state.error?.message || 'There was a temporary issue loading this screen.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="w-full py-3 px-6 text-white font-bold rounded-xl shadow-md hover:opacity-90 transition-all cursor-pointer"
              style={{ backgroundColor: 'var(--primary-color, #601a4f)' }}
            >
              Return to Start
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type AppRoute = 'kiosk' | 'mobile_pickup' | 'admin' | 'kds' | 'cashier';

export default function App() {
  const [route, setRoute] = useState<AppRoute>('kiosk');
  const [adminUnlockedFromSecret, setAdminUnlockedFromSecret] = useState(false);
  const [secretModalOpen, setSecretModalOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState<'intro' | 'selector' | 'menu'>('intro');
  const [settings, setSettings] = useState<Settings>(DEFAULT_TOTEM_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const handleEnterTotemFullscreen = async () => {
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request blocked or unsupported:', err);
    }
  };

  const navigateTo = (nextRoute: AppRoute, unlocked: boolean = false) => {
    setAdminUnlockedFromSecret(unlocked);
    setRoute(nextRoute);
    try {
      if (nextRoute === 'admin') {
        window.history.pushState({}, '', '/admin');
      } else if (nextRoute === 'kds') {
        window.history.pushState({}, '', '/kds');
      } else if (nextRoute === 'cashier') {
        window.history.pushState({}, '', '/cashier');
      } else if (nextRoute === 'mobile_pickup') {
        window.history.pushState({}, '', '/order');
      } else {
        window.history.pushState({}, '', '/');
      }
    } catch {
      // Ignore history errors inside sandboxed iframes
    }
  };

  useEffect(() => {
    // Trigger automatic catalog preservation & seed on the new app-toten-ebc Firestore
    ensureInitialCatalogSeed().catch((err) => {
      console.warn('Initial catalog seed check warning:', err);
    });

    const syncRouteFromLocation = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const search = window.location.search.toLowerCase();

      if (
        path === '/cashier' ||
        path.endsWith('/cashier') ||
        path.startsWith('/cashier/') ||
        hash === '#/cashier' ||
        hash === '#cashier' ||
        search.includes('cashier=true')
      ) {
        setRoute('cashier');
      } else if (
        path === '/kds' ||
        path.endsWith('/kds') ||
        hash === '#/kds' ||
        hash === '#kds' ||
        search.includes('kds=true')
      ) {
        setRoute('kds');
      } else if (
        path === '/admin' ||
        path.endsWith('/admin') ||
        hash === '#/admin' ||
        hash === '#admin' ||
        hash.includes('admin') ||
        search.includes('admin=true')
      ) {
        setRoute('admin');
      } else if (
        path === '/order' ||
        path.endsWith('/order') ||
        path.startsWith('/order/') ||
        hash === '#/order' ||
        hash === '#order' ||
        search.includes('mode=mobile')
      ) {
        setRoute('mobile_pickup');
      } else {
        setRoute('kiosk');
      }
    };

    syncRouteFromLocation();
    window.addEventListener('popstate', syncRouteFromLocation);
    window.addEventListener('hashchange', syncRouteFromLocation);

    // Load settings from Firestore
    const unsub = onSnapshot(
      doc(db, 'configuracoes', 'geral'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Settings;
          setSettings((prev) => ({
            ...prev,
            ...data,
            language: data.language || prev.language || 'en',
            currency: data.currency || prev.currency || 'USD',
            whatsappCountryCode: data.whatsappCountryCode || '+1',
            salesTaxRate: typeof data.salesTaxRate === 'number' ? data.salesTaxRate : (prev.salesTaxRate ?? 7.75),
            terminalProvider: data.terminalProvider || prev.terminalProvider || 'simulation',
            venmoUsername: data.venmoUsername !== undefined ? sanitizeVenmoUsername(data.venmoUsername) : 'easykioski-demo',
            paypalMeUsername: data.paypalMeUsername !== undefined ? sanitizePaypalUsername(data.paypalMeUsername) : 'easykioskidemo',
            cashAppTag: data.cashAppTag !== undefined ? sanitizeCashAppTag(data.cashAppTag) : 'easykioskidemo',
            allowPayAtCounter: data.allowPayAtCounter !== undefined ? data.allowPayAtCounter : true,
          }));
        }
        setLoading(false);
      },
      (error) => {
        console.error('App: Error loading settings:', error);
        setLoading(false);
      }
    );

    return () => {
      window.removeEventListener('popstate', syncRouteFromLocation);
      window.removeEventListener('hashchange', syncRouteFromLocation);
      unsub();
    };
  }, []);

  const theme = getBrandTheme(settings);

  // Sync theme variables whenever settings change
  useEffect(() => {
    if (settings) {
      if (settings.brandName) {
        document.title =
          route === 'kds'
            ? `${settings.brandName} · Kitchen Display`
            : route === 'cashier'
              ? `${settings.brandName} · Cashier POS`
              : route === 'mobile_pickup'
                ? `${settings.brandName} · Mobile Pickup`
                : `${settings.brandName} · Self-Service Kiosk`;
      }
      const root = document.documentElement.style;
      root.setProperty('--primary-color', theme.primary);
      root.setProperty('--primary-border', theme.primaryBorder);
      root.setProperty('--glass-color', theme.cardBg);
      root.setProperty('--surface-color', theme.surfaceBg);
      root.setProperty('--text-color', theme.text);
      root.setProperty('--category-color', theme.categoryText);
      root.setProperty('--brand-color', theme.brandText);
      root.setProperty('--price-color', theme.price);
      root.setProperty('--details-color', theme.details);

      const themeColorMeta = document.getElementById('theme-color');
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', theme.primary);
      }
    }
  }, [
    route,
    settings?.brandName,
    theme.primary,
    theme.primaryBorder,
    theme.cardBg,
    theme.surfaceBg,
    theme.text,
    theme.categoryText,
    theme.brandText,
    theme.price,
    theme.details,
  ]);

  if (loading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ backgroundColor: theme.surfaceBg }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: theme.primary, borderTopColor: 'transparent' }}
          />
          <p className="font-medium" style={{ color: theme.primary }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (route === 'kds') {
    return (
      <ErrorBoundary>
        <Toaster position="top-center" richColors />
        <KDSView
          settings={settings}
          onExitToKiosk={() => navigateTo('kiosk', false)}
          onOpenAdmin={() => navigateTo('admin', adminUnlockedFromSecret)}
        />
      </ErrorBoundary>
    );
  }

  if (route === 'cashier') {
    return (
      <ErrorBoundary>
        <Toaster position="top-center" richColors />
        <CashierView
          settings={settings}
          initialUnlocked={adminUnlockedFromSecret}
          onExitToKiosk={() => navigateTo('kiosk', false)}
          onOpenAdmin={() => navigateTo('admin', true)}
          onOpenKDS={() => navigateTo('kds', true)}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="relative min-h-screen w-full overflow-x-clip">
        <Toaster position="top-center" richColors />
        {/* Background Image */}
        <div
          className="fixed inset-0 z-[-2] bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url("${settings?.backgroundImage || 'https://i.ibb.co/X0vYy7L/cakes.png'}")`,
          }}
        />

        {/* Glass Overlay */}
        <div
          className="fixed inset-0 z-[-1] pointer-events-none transition-colors duration-500"
          style={{
            backgroundColor: theme.glassOverlay,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        />

        {/* Content */}
        <div className="relative z-0 flex flex-col min-h-screen">
          {route === 'admin' ? (
            <Admin
              settings={settings}
              setSettings={setSettings}
              setIsAdmin={(val) => {
                const next = typeof val === 'function' ? val(route === 'admin') : val;
                navigateTo(next ? 'admin' : 'kiosk', false);
              }}
              initialUnlocked={adminUnlockedFromSecret}
              onOpenKDS={() => navigateTo('kds', true)}
              onOpenCashier={() => navigateTo('cashier', true)}
            />
          ) : (
            <>
              <Menu
                mode={route === 'mobile_pickup' ? 'mobile_pickup' : 'totem'}
                settings={{
                  ...settings,
                  language: settings.language || 'en',
                  currency: settings.currency || 'USD',
                }}
                onScreenChange={setActiveScreen}
                onSecretLogoUnlock={route === 'kiosk' ? () => setSecretModalOpen(true) : undefined}
              />
              <Footer settings={settings} hideActionButtons={activeScreen !== 'menu'} />
            </>
          )}
        </div>

        {/* Discreet 1-click Fullscreen Button — Totem / Kiosk mode ONLY (hides automatically once in fullscreen; ESC exits) */}
        {route === 'kiosk' && !isFullscreen && (
          <button
            type="button"
            onClick={handleEnterTotemFullscreen}
            title="Expandir para Tela Cheia (ESC para sair)"
            className="fixed top-4 left-4 z-40 min-h-[38px] px-3 py-1.5 rounded-full backdrop-blur-md border shadow-sm flex items-center gap-1.5 text-[11px] font-bold tracking-wide transition-all cursor-pointer opacity-75 hover:opacity-100 active:scale-95"
            style={{
              backgroundColor: theme.pillBg,
              borderColor: theme.primaryBorder,
              color: theme.text,
            }}
          >
            <Maximize2 size={14} />
            <span className="hidden sm:inline">Tela Cheia</span>
          </button>
        )}

        {/* Full-screen Totem Screensaver (Totem / Kiosk route ONLY) */}
        <TotemScreensaverOverlay
          settings={settings}
          language={(settings.language === 'es' || settings.language === 'pt' ? settings.language : 'en')}
          enabled={route === 'kiosk' && !secretModalOpen}
        />

        {/* Secret 5-Tap Admin, KDS & Cashier Access Modal */}
        <SecretAdminModal
          isOpen={secretModalOpen}
          onClose={() => setSecretModalOpen(false)}
          settings={settings}
          onEnterAdmin={() => navigateTo('admin', true)}
          onEnterKDS={() => navigateTo('kds', true)}
          onEnterCashier={() => navigateTo('cashier', true)}
        />
      </div>
    </ErrorBoundary>
  );
}
