import jsQR from 'jsqr';
import {
  sanitizeCashAppTag,
  sanitizePaypalUsername,
  sanitizeVenmoUsername,
  TotemQrOnlyMethod,
} from '../services/appsScriptGenerator';

export interface QrWalletExtractionResult {
  username: string | null;
  detectedProvider: TotemQrOnlyMethod | null;
  rawPayload: string;
  resolvedUrl?: string;
  warning?: string;
  isOpaqueIdLink?: boolean;
}

interface NativeBarcodeResult {
  rawValue?: string;
}

interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<NativeBarcodeResult[]>;
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar a imagem do QR Code.'));
    img.src = src;
  });
}

function renderRegionToCanvas(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  targetMaxDim?: number,
  quietZoneRatio: number = 0.04
): { canvas: HTMLCanvasElement; imageData: ImageData } | null {
  const maxSourceDim = Math.max(sw, sh);
  const scale = targetMaxDim && maxSourceDim > targetMaxDim ? targetMaxDim / maxSourceDim : 1;
  const drawW = Math.max(1, Math.round(sw * scale));
  const drawH = Math.max(1, Math.round(sh * scale));
  const pad = Math.max(8, Math.round(Math.min(drawW, drawH) * quietZoneRatio));

  const canvas = document.createElement('canvas');
  canvas.width = drawW + pad * 2;
  canvas.height = drawH + pad * 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // White background guarantees transparent PNG QR codes and tight crops have a clean quiet zone
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, pad, pad, drawW, drawH);

  return {
    canvas,
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
  };
}

function binarizeImageData(src: ImageData, threshold: number): Uint8ClampedArray {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    const lum = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
    const v = lum < threshold ? 0 : 255;
    out[off] = v;
    out[off + 1] = v;
    out[off + 2] = v;
    out[off + 3] = 255;
  }
  return out;
}

/**
 * Separable box blur + high-contrast binarization.
 * Bridges tiny white gaps inside dotted/rounded QR modules (like Venmo & Cash App official QRs)
 * so finder patterns become solid 1:1:3:1:1 bars readable by jsQR.
 */
function boxBlurAndBinarize(src: ImageData, radius: number, threshold: number): Uint8ClampedArray {
  const { width, height, data } = src;
  const total = width * height;
  const gray = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const off = i * 4;
    gray[i] = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
  }

  // Horizontal pass (O(W*H))
  const horiz = new Float32Array(total);
  const windowSize = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = Math.min(width - 1, Math.max(0, dx));
      sum += gray[row + cx];
    }
    horiz[row] = sum / windowSize;
    for (let x = 1; x < width; x++) {
      const outX = Math.max(0, x - radius - 1);
      const inX = Math.min(width - 1, x + radius);
      sum += gray[row + inX] - gray[row + outX];
      horiz[row + x] = sum / windowSize;
    }
  }

  // Vertical pass + threshold (O(W*H))
  const out = new Uint8ClampedArray(total * 4);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      const cy = Math.min(height - 1, Math.max(0, dy));
      sum += horiz[cy * width + x];
    }
    const v0 = sum / windowSize < threshold ? 0 : 255;
    const off0 = x * 4;
    out[off0] = v0;
    out[off0 + 1] = v0;
    out[off0 + 2] = v0;
    out[off0 + 3] = 255;

    for (let y = 1; y < height; y++) {
      const outY = Math.max(0, y - radius - 1);
      const inY = Math.min(height - 1, y + radius);
      sum += horiz[inY * width + x] - horiz[outY * width + x];
      const v = sum / windowSize < threshold ? 0 : 255;
      const off = (y * width + x) * 4;
      out[off] = v;
      out[off + 1] = v;
      out[off + 2] = v;
      out[off + 3] = 255;
    }
  }

  return out;
}

/**
 * Morphological dark dilation (min filter on binarized pixels).
 * Connects separated circular dots in stylized QR codes without shifting module centers.
 */
function dilateDarkPixels(src: ImageData, radius: number, threshold: number): Uint8ClampedArray {
  const { width, height, data } = src;
  const total = width * height;
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const off = i * 4;
    const lum = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
    mask[i] = lum < threshold ? 0 : 255;
  }

  const out = new Uint8ClampedArray(total * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minV = 255;
      for (let dy = -radius; dy <= radius && minV > 0; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const rowOffset = ny * width;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (mask[rowOffset + nx] === 0) {
            minV = 0;
            break;
          }
        }
      }
      const off = (y * width + x) * 4;
      out[off] = minV;
      out[off + 1] = minV;
      out[off + 2] = minV;
      out[off + 3] = 255;
    }
  }
  return out;
}

function tryJsQrVariants(imageData: ImageData): string | null {
  const { width, height, data } = imageData;

  // 1. Direct scan
  const raw = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  if (raw?.data?.trim()) return raw.data.trim();

  // 2. Soft blur + binarization (instant win for dotted Venmo / Cash App / PayPal QRs)
  for (const [radius, threshold] of [
    [1, 180],
    [2, 180],
    [1, 150],
    [2, 205],
  ] as const) {
    const blurred = boxBlurAndBinarize(imageData, radius, threshold);
    const res = jsQR(blurred, width, height, { inversionAttempts: 'attemptBoth' });
    if (res?.data?.trim()) return res.data.trim();
  }

  // 3. Morphological dark dilation (bridges circular dots with central avatar/logo)
  const dilated = dilateDarkPixels(imageData, 1, 170);
  const dilatedRes = jsQR(dilated, width, height, { inversionAttempts: 'attemptBoth' });
  if (dilatedRes?.data?.trim()) return dilatedRes.data.trim();

  // 4. Clean high-contrast binarization
  const binary = binarizeImageData(imageData, 165);
  const binRes = jsQR(binary, width, height, { inversionAttempts: 'attemptBoth' });
  if (binRes?.data?.trim()) return binRes.data.trim();

  return null;
}

async function tryNativeBarcodeDetector(
  img: HTMLImageElement,
  fallbackCanvases: HTMLCanvasElement[]
): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const DetectorCtor = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor })
    .BarcodeDetector;
  if (!DetectorCtor) return null;

  try {
    if (typeof DetectorCtor.getSupportedFormats === 'function') {
      const formats = await DetectorCtor.getSupportedFormats();
      if (!formats.includes('qr_code')) return null;
    }

    const detector = new DetectorCtor({ formats: ['qr_code'] });

    // First try directly on the original image element
    const direct = await detector.detect(img);
    const directVal = direct.find((b) => b.rawValue?.trim())?.rawValue?.trim();
    if (directVal) return directVal;

    // Try on padded/cropped canvases (helps when QR has transparent background or tight edges)
    for (const canvas of fallbackCanvases) {
      const detected = await detector.detect(canvas);
      const val = detected.find((b) => b.rawValue?.trim())?.rawValue?.trim();
      if (val) return val;
    }
  } catch {
    // Gracefully fall back to jsQR if BarcodeDetector fails on this platform/image
  }

  return null;
}

/**
 * Decodes a QR Code from an uploaded image file completely client-side.
 * 1. Tries native browser BarcodeDetector API first (Chrome/Edge/Android — handles stylized QRs natively).
 * 2. Falls back to multi-resolution, center-cropped, blur/dilation + binarized jsQR passes
 *    for stylized/dotted QR codes with central photos or logos (Venmo, PayPal, Cash App).
 */
export async function decodeQrCodeFromImageFile(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;

    // Pre-build key regions (original, 900px, 600px, and center crops)
    const fullOriginal = renderRegionToCanvas(img, 0, 0, w, h, 1400);
    const full900 = w > 900 || h > 900 ? renderRegionToCanvas(img, 0, 0, w, h, 900) : null;
    const full600 = w > 600 || h > 600 ? renderRegionToCanvas(img, 0, 0, w, h, 600) : null;

    // Center square crop (ignores wide white borders and @username headers/footers)
    const minSide = Math.min(w, h);
    const cropSize = Math.round(minSide * 0.78);
    const cropX = Math.round((w - cropSize) / 2);
    const cropY = Math.round((h - cropSize) / 2);
    const centerCrop900 = renderRegionToCanvas(img, cropX, cropY, cropSize, cropSize, 900);

    // Lower-center crop (useful for mobile screenshots with app header + @username above the QR)
    const lowerCropY = Math.min(h - cropSize, Math.round((h - cropSize) * 0.62));
    const lowerCenterCrop =
      h > w * 1.15 ? renderRegionToCanvas(img, cropX, Math.max(0, lowerCropY), cropSize, cropSize, 900) : null;

    // Step 1: Native BarcodeDetector API (fastest & handles stylized/logo QRs natively)
    const nativeCanvases = [fullOriginal?.canvas, centerCrop900?.canvas, lowerCenterCrop?.canvas].filter(
      (c): c is HTMLCanvasElement => Boolean(c)
    );
    const nativeResult = await tryNativeBarcodeDetector(img, nativeCanvases);
    if (nativeResult) return nativeResult;

    // Step 2: Multi-pass jsQR fallback across resolutions, center crops, blur/dilation, and binarization
    const candidateRegions = [
      full900,
      full600,
      fullOriginal,
      centerCrop900,
      lowerCenterCrop,
      renderRegionToCanvas(img, cropX, cropY, cropSize, cropSize, 600),
    ].filter((r): r is { canvas: HTMLCanvasElement; imageData: ImageData } => Boolean(r));

    for (const region of candidateRegions) {
      const decoded = tryJsQrVariants(region.imageData);
      if (decoded) return decoded;
    }

    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Parses a decoded QR code string (URL or handle) and extracts the clean wallet username.
 */
export function extractWalletFromQrPayload(
  rawText: string,
  expectedMethod: TotemQrOnlyMethod
): QrWalletExtractionResult {
  const rawPayload = rawText.trim();

  // 1. Venmo detection
  if (/venmo\.com|venmo:\/\//i.test(rawPayload)) {
    if (/venmo\.com\/code(?:[/?#]|$)/i.test(rawPayload)) {
      return {
        username: null,
        detectedProvider: 'venmo',
        rawPayload,
        isOpaqueIdLink: true,
        warning:
          'Este QR Code oficial do Venmo usa um ID numérico interno (venmo.com/code?user_id=...). Para gerar o QR dinâmico com valor e Order # preenchidos automaticamente, confirme seu @username (exibido logo abaixo do QR no app do Venmo).',
      };
    }

    const user = sanitizeVenmoUsername(rawPayload);
    return {
      username: user || null,
      detectedProvider: 'venmo',
      rawPayload,
      warning: user ? undefined : 'QR Code do Venmo lido, mas não foi possível extrair o usuário automaticamente.',
    };
  }

  // 2. PayPal detection
  if (/paypal\.me|paypal\.com/i.test(rawPayload)) {
    if (/paypal\.com\/(?:qrcodes|myaccount|webapps|cgi-bin)\//i.test(rawPayload)) {
      return {
        username: null,
        detectedProvider: 'paypal',
        rawPayload,
        isOpaqueIdLink: true,
        warning:
          'Este QR Code do PayPal usa um código interno da conta (paypal.com/qrcodes/...). Para preencher o valor do pedido automaticamente no Totem, digite seu usuário PayPal.me (ex: easybyzcreator).',
      };
    }

    const user = sanitizePaypalUsername(rawPayload);
    return {
      username: user || null,
      detectedProvider: 'paypal',
      rawPayload,
      warning: user ? undefined : 'QR Code do PayPal lido, mas não foi possível extrair o usuário PayPal.me.',
    };
  }

  // 3. Cash App detection
  if (/cash\.app|cash\.me/i.test(rawPayload)) {
    if (/cash\.(?:app|me)\/qr\//i.test(rawPayload)) {
      return {
        username: null,
        detectedProvider: 'cashapp',
        rawPayload,
        isOpaqueIdLink: true,
        warning:
          'Este QR Code do Cash App usa um link interno (/qr/...). Digite seu $Cashtag (exibido no perfil do Cash App) para o Totem gerar o QR com o valor já preenchido.',
      };
    }

    const tag = sanitizeCashAppTag(rawPayload);
    return {
      username: tag || null,
      detectedProvider: 'cashapp',
      rawPayload,
      warning: tag ? undefined : 'QR Code do Cash App lido, mas não foi possível extrair o $Cashtag.',
    };
  }

  // 4. Plain handle fallback (e.g. @usuario or $cashtag without URL)
  if (!/^https?:\/\//i.test(rawPayload) && !rawPayload.includes(' ')) {
    const cleaned =
      expectedMethod === 'venmo'
        ? sanitizeVenmoUsername(rawPayload)
        : expectedMethod === 'paypal'
          ? sanitizePaypalUsername(rawPayload)
          : sanitizeCashAppTag(rawPayload);

    if (cleaned) {
      return {
        username: cleaned,
        detectedProvider: expectedMethod,
        rawPayload,
      };
    }
  }

  return {
    username: null,
    detectedProvider: null,
    rawPayload,
    warning: `QR Code lido (${rawPayload.slice(0, 60)}${rawPayload.length > 60 ? '...' : ''}), mas não corresponde a um link de usuário Venmo, PayPal.me ou Cash App.`,
  };
}

/**
 * Extracts wallet username from a decoded QR payload.
 * For official opaque QR links (e.g. https://venmo.com/code?user_id=...),
 * resolves the canonical redirect via /api/resolve-wallet-url to extract the exact @username automatically.
 */
export async function resolveAndExtractWalletFromQrPayload(
  rawText: string,
  expectedMethod: TotemQrOnlyMethod
): Promise<QrWalletExtractionResult> {
  const initial = extractWalletFromQrPayload(rawText, expectedMethod);
  if (initial.username || !initial.isOpaqueIdLink) {
    return initial;
  }

  try {
    const response = await fetch('/api/resolve-wallet-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: initial.rawPayload }),
    });

    if (response.ok) {
      const data = await response.json();
      const resolvedUrl = typeof data?.resolvedUrl === 'string' ? data.resolvedUrl.trim() : '';
      if (resolvedUrl && resolvedUrl !== initial.rawPayload) {
        const resolved = extractWalletFromQrPayload(resolvedUrl, expectedMethod);
        if (resolved.username) {
          return {
            ...resolved,
            rawPayload: initial.rawPayload,
            resolvedUrl,
          };
        }
      }
    }
  } catch {
    // Gracefully keep initial warning if backend resolver is unavailable (e.g. static deploy)
  }

  return initial;
}
