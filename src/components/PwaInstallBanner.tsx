import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Smartphone, X, Share, PlusSquare, MoreVertical, Download } from 'lucide-react';
import { Settings } from '../types';
import { getBrandTheme } from '../utils/brandTheme';
import { getKioskDict, KioskLanguage } from '../utils/kioskI18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaInstallBannerProps {
  settings: Settings;
  language: KioskLanguage;
}

const DISMISS_SESSION_KEY = 'easy_kioski_pwa_banner_dismissed_session';

export const PwaInstallBanner: React.FC<PwaInstallBannerProps> = ({ settings, language }) => {
  const theme = getBrandTheme(settings);
  const t = getKioskDict(language);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(DISMISS_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  useEffect(() => {
    const standaloneCheck =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as any)?.standalone === true;
    setIsStandalone(Boolean(standaloneCheck));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isStandalone || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_SESSION_KEY, '1');
    } catch {
      // Ignore storage errors
    }
  };

  const handleInstallAction = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsStandalone(true);
        }
        setDeferredPrompt(null);
        return;
      } catch {
        // Fallback to instructions modal
      }
    }
    setShowInstructions(true);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl mx-auto mb-4 px-1"
      >
        <div
          className="backdrop-blur-xl rounded-2xl px-3.5 py-2.5 border shadow-sm flex items-center justify-between gap-3"
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.primaryBorder,
            color: theme.text,
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
              style={{
                backgroundColor: theme.primaryTint12,
                color: theme.primary,
              }}
            >
              <Smartphone size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold leading-snug truncate" style={{ color: theme.text }}>
                {t.pwaBannerTitle}
              </p>
              <p className="text-[11px] leading-tight truncate" style={{ color: theme.textMuted }}>
                {t.pwaBannerSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallAction}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              style={{
                backgroundColor: theme.primary,
                color: theme.primaryContrast,
              }}
            >
              <Download size={13} />
              <span>{deferredPrompt ? t.pwaBannerInstallBtn : t.pwaBannerHowToBtn}</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t.close}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              style={{
                backgroundColor: theme.primaryTint08,
                color: theme.textMuted,
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showInstructions && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInstructions(false)}
              className="absolute inset-0 bg-black/55 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              className="relative w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-5 font-sans"
              style={{
                backgroundColor: theme.modalBg,
                borderColor: theme.primaryBorder,
                color: theme.text,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: theme.primaryTint12, color: theme.primary }}
                  >
                    <Smartphone size={20} />
                  </div>
                  <h3 className="text-lg font-serif font-black" style={{ color: theme.text }}>
                    {t.pwaModalTitle}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInstructions(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: theme.primaryTint08, color: theme.textMuted }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {/* iOS Safari */}
                <div
                  className="p-4 rounded-2xl border space-y-2"
                  style={{ backgroundColor: theme.cardBgSolid, borderColor: theme.primaryBorder }}
                >
                  <div
                    className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: theme.primary }}
                  >
                    <Share size={14} />
                    <span>{t.pwaIosLabel}</span>
                  </div>
                  <ol className="text-xs space-y-1.5 list-decimal list-inside" style={{ color: theme.textMuted }}>
                    <li>{t.pwaIosStep1}</li>
                    <li className="flex items-start gap-1.5">
                      <PlusSquare size={13} className="shrink-0 mt-0.5" style={{ color: theme.primary }} />
                      <span>{t.pwaIosStep2}</span>
                    </li>
                  </ol>
                </div>

                {/* Android Chrome */}
                <div
                  className="p-4 rounded-2xl border space-y-2"
                  style={{ backgroundColor: theme.cardBgSolid, borderColor: theme.primaryBorder }}
                >
                  <div
                    className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: theme.primary }}
                  >
                    <MoreVertical size={14} />
                    <span>{t.pwaAndroidLabel}</span>
                  </div>
                  <ol className="text-xs space-y-1.5 list-decimal list-inside" style={{ color: theme.textMuted }}>
                    <li>{t.pwaAndroidStep1}</li>
                    <li>{t.pwaAndroidStep2}</li>
                  </ol>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="w-full py-3.5 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-md cursor-pointer active:scale-[0.99] transition-all"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryContrast,
                }}
              >
                {t.pwaGotIt}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
