import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { Settings } from '../types';
import { getBrandTheme } from '../utils/brandTheme';

interface FooterProps {
  settings?: Settings;
  onOpenAdmin?: () => void;
  hideActionButtons?: boolean;
}

export default function Footer({
  settings,
  hideActionButtons = false,
}: FooterProps) {
  const theme = getBrandTheme(settings);
  const primaryColor = theme.primary;
  const [activePromoModal, setActivePromoModal] = useState<{ title: string; image: string } | null>(null);

  const masterEnabled = settings?.footerButtonsEnabled !== false;
  const btn1Enabled = masterEnabled && settings?.footerBtn1Enabled !== false;
  const btn2Enabled = masterEnabled && settings?.footerBtn2Enabled !== false;

  const btn1Label = (settings?.footerBtn1Label ?? 'EVENTOS').trim() || 'EVENTOS';
  const btn2Label = (settings?.footerBtn2Label ?? 'MENTORIA').trim() || 'MENTORIA';

  const btn1Image = settings?.footerBtn1Image || '';
  const btn2Image = settings?.footerBtn2Image || '';

  const showButtonsBlock = !hideActionButtons && (btn1Enabled || btn2Enabled);

  return (
    <footer className="w-full py-8 flex flex-col items-center justify-center gap-4 mt-auto px-4">
      {/* Botões de Ação configuráveis (ex: EVENTOS & MENTORIA) */}
      {showButtonsBlock && (
        <div className="flex flex-col items-center justify-center gap-3.5 mb-8 w-full max-w-xs animate-in fade-in">
          {/* Botão 1 */}
          {btn1Enabled && (
            <div className="relative flex flex-col items-center justify-center w-full max-w-[260px]">
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (btn1Image) {
                    setActivePromoModal({ title: btn1Label, image: btn1Image });
                  }
                }}
                className={`w-full py-3.5 px-6 rounded-full font-bold text-xs uppercase tracking-widest shadow-md hover:shadow-lg transition-all text-center border border-white/20 flex items-center justify-center hover:brightness-110 ${
                  btn1Image ? 'cursor-pointer' : 'cursor-default'
                }`}
                style={{ backgroundColor: primaryColor, color: theme.primaryContrast }}
              >
                {btn1Label}
              </motion.button>
            </div>
          )}

          {/* Botão 2 */}
          {btn2Enabled && (
            <div className="relative flex flex-col items-center justify-center w-full max-w-[260px]">
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (btn2Image) {
                    setActivePromoModal({ title: btn2Label, image: btn2Image });
                  }
                }}
                className={`w-full py-3.5 px-6 rounded-full font-bold text-xs uppercase tracking-widest shadow-md hover:shadow-lg transition-all text-center border border-white/20 flex items-center justify-center hover:brightness-110 ${
                  btn2Image ? 'cursor-pointer' : 'cursor-default'
                }`}
                style={{ backgroundColor: primaryColor, color: theme.primaryContrast }}
              >
                {btn2Label}
              </motion.button>
            </div>
          )}
        </div>
      )}

      <a
        href="https://easybyzcreator.com"
        target="_blank"
        rel="noopener noreferrer"
        className="group mt-1 flex flex-col items-center cursor-pointer"
        title="Easy Byz Creator"
      >
        <p
          className="text-[10px] tracking-[0.2em] font-sans font-bold uppercase group-hover:opacity-80 transition-opacity"
          style={{ color: primaryColor }}
        >
          DEVELOPED BY
        </p>
        <motion.div
          role="img"
          aria-label="EasyByz Logo"
          className="h-[158px] w-[158px] transition-colors duration-300"
          style={{
            backgroundColor: primaryColor,
            WebkitMaskImage: 'url("/easybyz-footer-logo.png")',
            maskImage: 'url("/easybyz-footer-logo.png")',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
          }}
          initial={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </a>

      {/* Modal de exibição da imagem 1080x1350 (proporção 4:5) */}
      <AnimatePresence>
        {activePromoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActivePromoModal(null)}
            className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[420px] max-h-[90vh] flex flex-col items-center"
            >
              <button
                type="button"
                onClick={() => setActivePromoModal(null)}
                aria-label="Fechar"
                className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-white text-black shadow-lg flex items-center justify-center hover:bg-gray-100 active:scale-95 transition-all cursor-pointer border border-black/10"
              >
                <X size={18} />
              </button>

              <div className="w-full aspect-[4/5] max-h-[82vh] rounded-2xl overflow-hidden shadow-2xl bg-black/20 border border-white/20">
                <img
                  src={activePromoModal.image}
                  alt={activePromoModal.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </footer>
  );
}
