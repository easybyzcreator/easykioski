import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Product, Category, Settings, CartItem } from '../types';
import { Plus, Minus } from 'lucide-react';
import { formatMoney, getKioskDict } from '../utils/kioskI18n';
import { getBrandTheme } from '../utils/brandTheme';

interface AnimatedProductCardProps {
  product: Product;
  category: Category;
  settings: Settings;
  cart: CartItem[];
  currencySymbol: string;
  requiresSelection?: boolean;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onRemoveFromCart: (cartItemId: string) => void;
  getContrastText: (hexColor?: string) => string;
}

export const AnimatedProductCard: React.FC<AnimatedProductCardProps> = ({
  product,
  category,
  settings,
  cart,
  requiresSelection,
  onSelectProduct,
  onAddToCart,
  onRemoveFromCart,
  getContrastText,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const t = getKioskDict(settings.language);
  const currency = settings.currency || 'USD';
  const theme = getBrandTheme(settings);
  const primaryColor = theme.primary;

  const totalQty = cart
    .filter((item) => item.productId === product.id)
    .reduce((sum, item) => sum + item.quantity, 0);

  const hasSizes = !!(product.hasSizes !== false && product.sizes && product.sizes.length > 0);
  const requiresCustomization =
    typeof requiresSelection === 'boolean'
      ? requiresSelection
      : !!(
          hasSizes ||
          product.isCustomCake ||
          (product.isCustomSandwich && Boolean(product.customFillings?.trim())) ||
          (product.isMeal &&
            (Boolean(product.ingredients?.trim()) ||
              Boolean(product.allowedSides && product.allowedSides.length > 0)))
        );

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setPointerPos({ x, y });
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-24px' }}
      whileTap={{ scale: 0.985 }}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => {
        setIsHovered(false);
        setPointerPos({ x: 0, y: 0 });
      }}
      onPointerMove={handlePointerMove}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.cart-button-area')) {
          return;
        }
        onSelectProduct(product);
      }}
      className="backdrop-blur-md rounded-[28px] p-3.5 sm:p-4 border transition-all duration-300 flex flex-col justify-between cursor-pointer w-full group relative overflow-visible"
      style={{
        perspective: 1200,
        backgroundColor: theme.cardBg,
        borderColor: isHovered ? theme.primaryBorderStrong : theme.primaryBorder,
        boxShadow: isHovered
          ? `0 20px 44px ${theme.primaryShadow}`
          : '0 4px 24px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Featured Product Photo — Borderless 3D Floating Motion with Soft Rounded Corners */}
      <div
        className="relative w-full aspect-[4/3] mb-3.5 flex items-center justify-center overflow-visible"
        style={{ perspective: 1000 }}
      >
        <motion.div
          animate={{
            rotateY: isHovered ? pointerPos.x * 24 : 0,
            rotateX: isHovered ? -pointerPos.y * 24 : 4,
            y: isHovered ? -14 : -4,
            scale: isHovered ? 1.07 : 1,
          }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, mass: 0.8 }}
          style={{
            transformStyle: 'preserve-3d',
            filter: isHovered
              ? `drop-shadow(0 22px 24px ${theme.primaryShadow})`
              : 'drop-shadow(0 12px 16px rgba(0, 0, 0, 0.16))',
          }}
          className="relative w-full h-full flex items-center justify-center z-10"
        >
          <img
            src={product.image}
            alt={product.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover rounded-[22px] select-none pointer-events-none"
            loading="lazy"
          />
        </motion.div>

        {/* Quiet Editorial Category Label */}
        <div className="absolute top-2.5 left-2.5 z-20 pointer-events-none">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide backdrop-blur-sm border shadow-xs"
            style={{
              backgroundColor: theme.pillBg,
              color: theme.categoryText,
              borderColor: theme.primaryBorder,
            }}
          >
            {category.title}
          </span>
        </div>
      </div>

      {/* Clean Card Title + Discreet "+ Details" Trigger (No Description on Card Face) */}
      <div className="flex flex-col flex-grow px-0.5 mb-3">
        <h3
          className="text-base sm:text-lg font-serif font-black leading-snug tracking-tight line-clamp-2 group-hover:translate-x-0.5 transition-transform"
          style={{ color: settings.productTitleColor || theme.text }}
        >
          {product.title}
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectProduct(product);
          }}
          className="mt-1.5 self-start inline-flex items-center text-[11px] font-bold tracking-wide uppercase opacity-90 hover:opacity-100 transition-opacity cursor-pointer"
          style={{ color: theme.details }}
        >
          {t.detailsBtn}
        </button>
      </div>

      {/* Footer: Price + Quick Touch Add (+) / Stepper */}
      <div
        className="pt-3 border-t flex items-center justify-between gap-2 mt-auto px-0.5"
        style={{ borderColor: theme.primaryBorder }}
      >
        <div className="min-w-0">
          {hasSizes && product.sizes ? (
            <div>
              <span
                className="text-[10px] font-semibold uppercase block tracking-wider leading-tight"
                style={{ color: theme.textMuted }}
              >
                {t.startingAt}
              </span>
              <p
                className="text-lg font-serif font-black tabular-nums leading-tight"
                style={{ color: theme.price }}
              >
                {formatMoney(Math.min(...product.sizes.map((s) => s.price)), currency)}
              </p>
            </div>
          ) : product.isCustomCake || product.priceType === 'consult' ? (
            <span
              className="text-xs uppercase font-serif font-black tracking-wider"
              style={{ color: theme.price }}
            >
              {t.onRequest}
            </span>
          ) : (
            <div>
              {(product.oldPrice ?? 0) > 0 && (
                <span
                  className="text-xs line-through block leading-none tabular-nums"
                  style={{ color: theme.textSoft }}
                >
                  {formatMoney(product.oldPrice, currency)}
                </span>
              )}
              <p
                className="text-lg font-serif font-black tabular-nums leading-tight"
                style={{ color: theme.price }}
              >
                {formatMoney(product.price && product.price > 0 ? product.price : product.oldPrice || 0, currency)}
              </p>
            </div>
          )}
        </div>

        {/* Quick Add (+) or Quantity Stepper */}
        <div className="cart-button-area flex items-center gap-1.5 shrink-0">
          {!requiresCustomization && totalQty > 0 ? (
            <div
              className="flex items-center gap-1.5 border rounded-full p-1 shadow-sm"
              style={{
                backgroundColor: theme.cardBgSolid,
                borderColor: theme.primaryBorder,
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const item = cart.find((i) => i.productId === product.id);
                  if (item) onRemoveFromCart(item.id);
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors active:scale-90 cursor-pointer"
                style={{
                  backgroundColor: theme.primaryTint08,
                  color: primaryColor,
                }}
                aria-label="Decrease quantity"
              >
                <Minus size={15} />
              </button>
              <span
                className="text-sm font-black min-w-[20px] text-center tabular-nums"
                style={{ color: theme.text }}
              >
                {totalQty}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCart(product, 1);
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow-sm active:scale-90 cursor-pointer"
                style={{
                  backgroundColor: primaryColor,
                  color: getContrastText(primaryColor),
                }}
                aria-label="Increase quantity"
              >
                <Plus size={15} />
              </button>
            </div>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={(e) => {
                e.stopPropagation();
                if (requiresCustomization || product.priceType === 'consult') {
                  onSelectProduct(product);
                } else {
                  onAddToCart(product, 1);
                }
              }}
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer relative"
              style={{
                backgroundColor: primaryColor,
                color: getContrastText(primaryColor),
              }}
              aria-label={requiresCustomization ? t.customize : t.add}
              title={requiresCustomization ? t.customize : t.add}
            >
              <Plus size={20} strokeWidth={2.6} />
              {requiresCustomization && totalQty > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center shadow-sm border"
                  style={{
                    backgroundColor: theme.details,
                    color: getContrastText(theme.details),
                    borderColor: theme.cardBgSolid,
                  }}
                >
                  {totalQty}
                </span>
              )}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
