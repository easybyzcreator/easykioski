import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, RotateCcw } from 'lucide-react';
import { getKioskDict, KioskLanguage } from '../utils/kioskI18n';
import { getContrastText } from '../utils/orderUtils';

import { getBrandTheme } from '../utils/brandTheme';

interface InactivityGuardProps {
  enabled: boolean; // Active when past intro OR cart has items OR a modal is open
  timeoutSeconds?: number; // Default 45s
  countdownSeconds?: number; // Default 10s
  primaryColor?: string;
  glassColor?: string;
  textColor?: string;
  language: KioskLanguage;
  onResetKiosk: () => void;
}

export const InactivityGuard: React.FC<InactivityGuardProps> = ({
  enabled,
  timeoutSeconds = 45,
  countdownSeconds = 10,
  primaryColor = '#601a4f',
  glassColor = '#ffffff',
  textColor = '#000000',
  language,
  onResetKiosk,
}) => {
  const t = getKioskDict(language);
  const theme = getBrandTheme({ primaryColor, glassColor, textColor });
  const [showPrompt, setShowPrompt] = useState(false);
  const [remaining, setRemaining] = useState(countdownSeconds);

  const idleTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const showPromptRef = useRef(false);

  useEffect(() => {
    showPromptRef.current = showPrompt;
  }, [showPrompt]);

  const clearTimers = () => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const startIdleTimer = () => {
    clearTimers();
    if (!enabled) return;

    const safeTimeoutMs = Math.max(15, timeoutSeconds) * 1000;
    idleTimerRef.current = window.setTimeout(() => {
      setShowPrompt(true);
      setRemaining(countdownSeconds);
    }, safeTimeoutMs);
  };

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setShowPrompt(false);
      return;
    }

    startIdleTimer();

    const handleUserActivity = () => {
      // Do not dismiss the countdown prompt passively on mousemove; require explicit button tap
      if (!showPromptRef.current) {
        startIdleTimer();
      }
    };

    const events: (keyof WindowEventMap)[] = ['pointerdown', 'touchstart', 'keydown', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    return () => {
      clearTimers();
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
    };
  }, [enabled, timeoutSeconds, countdownSeconds]);

  useEffect(() => {
    if (!showPrompt) return;

    countdownIntervalRef.current = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearTimers();
          setShowPrompt(false);
          onResetKiosk();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [showPrompt, onResetKiosk]);

  const handleKeepOrdering = () => {
    setShowPrompt(false);
    setRemaining(countdownSeconds);
    startIdleTimer();
  };

  const handleStartOver = () => {
    clearTimers();
    setShowPrompt(false);
    onResetKiosk();
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
          />

          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="relative w-full max-w-md totem-modal-enlarged backdrop-blur-2xl rounded-[32px] p-8 shadow-2xl border text-center space-y-6"
            style={{
              backgroundColor: theme.modalBg,
              borderColor: theme.primaryBorder,
              color: theme.text,
              '--totem-base-max-w': '28rem',
            } as React.CSSProperties}
          >
            <div
              className="mx-auto w-20 h-20 rounded-full shadow-inner border flex flex-col items-center justify-center"
              style={{
                backgroundColor: theme.cardBgSolid,
                borderColor: theme.primaryBorder,
              }}
            >
              <Clock size={18} style={{ color: theme.primary }} />
              <span
                className="text-3xl font-serif font-black tabular-nums leading-none mt-0.5"
                style={{ color: theme.primary }}
              >
                {remaining}
              </span>
            </div>

            <div className="space-y-2">
              <h2
                className="text-2xl sm:text-3xl font-serif font-extrabold"
                style={{ color: theme.text }}
              >
                {t.stillOrderingTitle}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
                {t.stillOrderingDesc}
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={handleKeepOrdering}
                className="w-full min-h-[56px] rounded-2xl font-bold text-base shadow-xl active:scale-[0.98] transition-all cursor-pointer"
                style={{ backgroundColor: theme.primary, color: getContrastText(theme.primary) }}
              >
                {t.keepOrderingBtn}
              </button>

              <button
                type="button"
                onClick={handleStartOver}
                className="w-full min-h-[48px] rounded-2xl border font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                style={{
                  backgroundColor: theme.cardBgSolid,
                  borderColor: theme.primaryBorder,
                  color: theme.text,
                }}
              >
                <RotateCcw size={15} />
                <span>{t.startOverBtn}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
