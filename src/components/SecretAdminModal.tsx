import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, X, Settings as SettingsIcon, ChefHat, ShieldCheck, Store } from 'lucide-react';
import { Settings } from '../types';
import { getContrastText } from '../utils/orderUtils';
import { toast } from 'sonner';
import { getBrandTheme } from '../utils/brandTheme';

interface SecretAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onEnterAdmin: () => void;
  onEnterKDS: () => void;
  onEnterCashier?: () => void;
}

export const SecretAdminModal: React.FC<SecretAdminModalProps> = ({
  isOpen,
  onClose,
  settings,
  onEnterAdmin,
  onEnterKDS,
  onEnterCashier,
}) => {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const theme = getBrandTheme(settings);
  const primaryColor = theme.primary;
  const primaryContrast = getContrastText(primaryColor);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setUnlocked(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const expected = settings.adminPassword || 'admin123';
    if (password === expected) {
      setUnlocked(true);
      toast.success('Access granted');
    } else {
      toast.error('Incorrect password');
      setPassword('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
          />

          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            className="relative w-full max-w-sm backdrop-blur-2xl rounded-[30px] p-7 shadow-2xl border space-y-6"
            style={{
              backgroundColor: theme.modalBg,
              borderColor: theme.primaryBorder,
              color: theme.text,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  {unlocked ? <ShieldCheck size={20} /> : <Lock size={18} />}
                </div>
                <div>
                  <h3 className="font-serif font-extrabold text-lg" style={{ color: theme.text }}>
                    {unlocked ? 'Staff Access' : 'Restricted Access'}
                  </h3>
                  <p className="text-[11px]" style={{ color: theme.textMuted }}>
                    Admin Panel & Kitchen Display
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: theme.cardBgSolid,
                  borderColor: theme.primaryBorder,
                  color: theme.textMuted,
                }}
              >
                <X size={17} />
              </button>
            </div>

            {!unlocked ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full min-h-[50px] px-4 rounded-2xl border text-base focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: theme.cardBgSolid,
                    borderColor: theme.primaryBorder,
                    color: theme.text,
                    '--tw-ring-color': primaryColor,
                  } as React.CSSProperties}
                />
                <button
                  type="submit"
                  className="w-full min-h-[50px] rounded-2xl font-bold text-sm shadow-lg active:scale-[0.98] transition-all cursor-pointer"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  Unlock
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEnterAdmin();
                  }}
                  className="w-full min-h-[54px] px-5 rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all cursor-pointer"
                  style={{ backgroundColor: primaryColor, color: primaryContrast }}
                >
                  <SettingsIcon size={18} />
                  <span>Open Admin Panel</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEnterKDS();
                  }}
                  className="w-full min-h-[54px] px-5 rounded-2xl font-bold text-sm shadow-lg border flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all cursor-pointer"
                  style={{
                    backgroundColor: theme.details,
                    color: getContrastText(theme.details),
                    borderColor: theme.detailsBorder,
                  }}
                >
                  <ChefHat size={18} />
                  <span>Open Kitchen Display (KDS)</span>
                </button>

                {onEnterCashier && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEnterCashier();
                    }}
                    className="w-full min-h-[54px] px-5 rounded-2xl font-bold text-sm shadow-lg border flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all cursor-pointer bg-stone-900 text-white border-stone-800 hover:bg-stone-800"
                  >
                    <Store size={18} />
                    <span>Open Cashier POS (/cashier)</span>
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
