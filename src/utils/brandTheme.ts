import { Settings } from '../types';
import { getContrastText } from './orderUtils';

interface RGB {
  r: number;
  g: number;
  b: number;
}

function parseColorToRgb(input: string | undefined, fallback: RGB): RGB {
  if (!input || typeof input !== 'string') return fallback;
  const trimmed = input.trim();

  // Hex (#RGB, #RRGGBB, #RRGGBBAA)
  if (trimmed.startsWith('#')) {
    let hex = trimmed.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return { r, g, b };
      }
    }
  }

  // rgb(...) or rgba(...)
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: Math.min(255, Math.max(0, Number(rgbMatch[1]))),
      g: Math.min(255, Math.max(0, Number(rgbMatch[2]))),
      b: Math.min(255, Math.max(0, Number(rgbMatch[3]))),
    };
  }

  return fallback;
}

function toRgba(rgb: RGB, alpha: number): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixRgb(base: RGB, tint: RGB, weight: number): RGB {
  const w = Math.min(1, Math.max(0, weight));
  return {
    r: Math.round(base.r * (1 - w) + tint.r * w),
    g: Math.round(base.g * (1 - w) + tint.g * w),
    b: Math.round(base.b * (1 - w) + tint.b * w),
  };
}

function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export interface BrandTheme {
  primary: string;
  primaryContrast: string;
  primaryTint05: string;
  primaryTint08: string;
  primaryTint12: string;
  primaryTint18: string;
  primaryBorder: string;
  primaryBorderStrong: string;
  primaryShadow: string;

  glassRaw: string;
  glassOverlay: string;
  cardBg: string;
  cardBgSolid: string;
  modalBg: string;
  surfaceBg: string;
  pillBg: string;

  text: string;
  textMuted: string;
  textSoft: string;
  textDivider: string;

  categoryText: string;
  brandText: string;
  price: string;
  details: string;
  detailsTint: string;
  detailsBorder: string;
}

export function getBrandTheme(settings?: Partial<Settings>): BrandTheme {
  const primary = settings?.primaryColor?.trim() || '#601a4f';
  const glassRaw = settings?.glassColor?.trim() || '#ffffff';
  const text = settings?.textColor?.trim() || '#000000';
  const categoryText = settings?.categoryTextColor?.trim() || primary;
  const brandText = settings?.brandTextColor?.trim() || primary;
  const price = settings?.priceColor?.trim() || primary;
  const details = settings?.detailsColor?.trim() || price;

  const primaryRgb = parseColorToRgb(primary, { r: 96, g: 26, b: 79 });
  const glassRgb = parseColorToRgb(glassRaw, { r: 255, g: 255, b: 255 });
  const textRgb = parseColorToRgb(text, { r: 0, g: 0, b: 0 });
  const detailsRgb = parseColorToRgb(details, primaryRgb);

  // Subtle brand-harmonized surface derived from glassColor + 3% primaryColor
  const tintedSurfaceRgb = mixRgb(glassRgb, primaryRgb, 0.03);
  const modalSurfaceRgb = mixRgb(glassRgb, primaryRgb, 0.025);

  const glassOverlay = glassRaw.startsWith('rgba(')
    ? glassRaw
    : toRgba(glassRgb, 0.86);

  return {
    primary,
    primaryContrast: getContrastText(primary),
    primaryTint05: toRgba(primaryRgb, 0.05),
    primaryTint08: toRgba(primaryRgb, 0.08),
    primaryTint12: toRgba(primaryRgb, 0.12),
    primaryTint18: toRgba(primaryRgb, 0.18),
    primaryBorder: toRgba(primaryRgb, 0.16),
    primaryBorderStrong: toRgba(primaryRgb, 0.36),
    primaryShadow: toRgba(primaryRgb, 0.14),

    glassRaw,
    glassOverlay,
    cardBg: toRgba(glassRgb, 0.92),
    cardBgSolid: rgbToHex(glassRgb),
    modalBg: toRgba(modalSurfaceRgb, 0.97),
    surfaceBg: rgbToHex(tintedSurfaceRgb),
    pillBg: toRgba(glassRgb, 0.88),

    text,
    textMuted: toRgba(textRgb, 0.68),
    textSoft: toRgba(textRgb, 0.45),
    textDivider: toRgba(textRgb, 0.12),

    categoryText,
    brandText,
    price,
    details,
    detailsTint: toRgba(detailsRgb, 0.1),
    detailsBorder: toRgba(detailsRgb, 0.24),
  };
}
