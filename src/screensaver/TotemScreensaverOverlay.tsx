import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Settings } from '../types';
import { KioskLanguage } from '../utils/kioskI18n';
import { getBrandTheme } from '../utils/brandTheme';
import {
  ScreensaverSlide,
  subscribeTotemScreensaverSlides,
} from './screensaverStorage';

interface TotemScreensaverOverlayProps {
  settings: Settings;
  language: KioskLanguage;
  enabled: boolean; // True ONLY in Totem mode (never Mobile Pickup)
  onWakeUp?: () => void;
}

export const TotemScreensaverOverlay: React.FC<TotemScreensaverOverlayProps> = ({
  settings,
  language,
  enabled,
  onWakeUp,
}) => {
  const [slides, setSlides] = useState<ScreensaverSlide[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const idleTimerRef = useRef<number | null>(null);
  const lastMoveResetRef = useRef<number>(0);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  const isFeatureOn = enabled && Boolean(settings.screensaverEnabled);
  const idleSeconds = Math.max(5, Number(settings.screensaverIdleSeconds || settings.kioskInactivitySeconds || 45));
  const intervalSeconds = Math.max(3, Number(settings.screensaverIntervalSeconds || 6));
  const theme = getBrandTheme(settings);

  // Subscribe to separate totem_screensaver documents
  useEffect(() => {
    if (!enabled) {
      setSlides([]);
      return;
    }
    const unsub = subscribeTotemScreensaverSlides((loaded) => {
      setSlides(loaded);
    });
    return () => unsub();
  }, [enabled]);

  // Reset if disabled or slides become empty
  useEffect(() => {
    if (!isFeatureOn || slides.length === 0) {
      setIsActive(false);
    }
  }, [isFeatureOn, slides.length]);

  // Global inactivity detector for Totem screen
  useEffect(() => {
    if (!isFeatureOn || slides.length === 0) return;

    const scheduleIdle = () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        setCurrentIndex(0);
        setIsActive(true);
      }, idleSeconds * 1000);
    };

    const handleActivity = () => {
      if (isActive) return;
      scheduleIdle();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isActive) return;
      const prev = lastMousePosRef.current;
      if (prev && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 14) {
        return;
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      const now = Date.now();
      if (now - lastMoveResetRef.current < 1500) return;
      lastMoveResetRef.current = now;
      handleActivity();
    };

    scheduleIdle();

    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('wheel', handleActivity, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isFeatureOn, slides.length, idleSeconds, isActive]);

  // Advance slides smoothly while active
  useEffect(() => {
    if (!isActive || slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [isActive, slides.length, intervalSeconds]);

  const handleDismiss = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsActive(false);
    if (onWakeUp) onWakeUp();
  };

  if (!isFeatureOn || slides.length === 0) return null;

  const activeSlide = slides[currentIndex % slides.length];
  const tapPrompt =
    language === 'pt'
      ? 'Toque na tela para fazer seu pedido'
      : language === 'es'
        ? 'Toca la pantalla para iniciar tu pedido'
        : 'Tap anywhere to start your order';

  return (
    <AnimatePresence>
      {isActive && activeSlide && (
        <motion.div
          key="totem-screensaver-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          onClick={handleDismiss}
          onTouchStart={handleDismiss}
          className="fixed inset-0 z-[90] bg-black overflow-hidden select-none cursor-pointer flex items-center justify-center"
        >
          <AnimatePresence mode="sync">
            <motion.img
              key={`slide-${activeSlide.slot}-${currentIndex}`}
              src={activeSlide.image}
              alt={`Screensaver ${activeSlide.slot}`}
              initial={{ opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: 'easeInOut' }}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          </AnimatePresence>

          {/* Subtle bottom gradient + tap CTA */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/75 via-black/30 to-transparent flex flex-col items-center justify-end pb-9 px-6 gap-4">
            {slides.length > 1 && (
              <div className="flex items-center gap-2">
                {slides.map((s, idx) => (
                  <span
                    key={s.slot}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: idx === currentIndex % slides.length ? 26 : 8,
                      backgroundColor:
                        idx === currentIndex % slides.length
                          ? '#FFFFFF'
                          : 'rgba(255,255,255,0.45)',
                    }}
                  />
                ))}
              </div>
            )}

            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
              className="px-7 py-3.5 rounded-full shadow-2xl border border-white/25 text-white font-serif font-black text-base sm:text-lg tracking-wide"
              style={{ backgroundColor: theme.primary }}
            >
              {tapPrompt}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
