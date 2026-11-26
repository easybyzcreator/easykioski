import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const SCREENSAVER_COLLECTION = 'configuracoes';
export const SCREENSAVER_DOC_PREFIX = 'totem_screensaver_slide_';
export const SCREENSAVER_MAX_SLOTS = 5;

const getSlideDocRef = (slot: number) => {
  const safeSlot = Math.min(SCREENSAVER_MAX_SLOTS, Math.max(1, Math.round(slot)));
  return doc(db, SCREENSAVER_COLLECTION, `${SCREENSAVER_DOC_PREFIX}${safeSlot}`);
};

export interface ScreensaverSlide {
  slot: number; // 1..5
  image: string; // Compact WebP/JPEG data URL
  sizeBytes: number;
  width: number;
  height: number;
  format: string;
  updatedAt: string;
}

export interface CompressedScreensaverResult {
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  format: 'webp' | 'jpeg';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
    img.src = src;
  });
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Compacts any uploaded photo into a tiny, ultra-lightweight 4:5 (1080x1350 aspect ratio)
 * WebP image (falling back to JPEG) capped under ~95 KB so 5 slides take almost no storage
 * and load instantaneously on the kiosk display.
 */
export async function compressScreensaverImage(file: File): Promise<CompressedScreensaverResult> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) {
      throw new Error('Dimensões de imagem inválidas.');
    }

    // Exact 4:5 aspect ratio (1080 x 1350 proportion) at 720 x 900 — sharp on kiosk screens & ~60% smaller
    const targetW = 720;
    const targetH = 900;
    const targetRatio = targetW / targetH;
    const srcRatio = srcW / srcH;

    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;

    if (srcRatio > targetRatio) {
      sw = Math.round(srcH * targetRatio);
      sx = Math.round((srcW - sw) / 2);
    } else if (srcRatio < targetRatio) {
      sh = Math.round(srcW / targetRatio);
      sy = Math.round((srcH - sh) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Falha ao inicializar canvas de compactação.');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

    const testWebp = canvas.toDataURL('image/webp', 0.72);
    const supportsWebp = testWebp.startsWith('data:image/webp');
    const mime = supportsWebp ? 'image/webp' : 'image/jpeg';
    const format: 'webp' | 'jpeg' = supportsWebp ? 'webp' : 'jpeg';

    const maxBytes = 95_000;
    const qualitySteps = supportsWebp ? [0.74, 0.64, 0.54, 0.45, 0.36] : [0.7, 0.58, 0.48, 0.38];

    let bestDataUrl = '';
    let bestBytes = Infinity;

    for (const q of qualitySteps) {
      const candidate = canvas.toDataURL(mime, q);
      const bytes = estimateDataUrlBytes(candidate);
      bestDataUrl = candidate;
      bestBytes = bytes;
      if (bytes <= maxBytes) {
        break;
      }
    }

    if (bestBytes > 130_000) {
      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = 540;
      smallCanvas.height = 675;
      const smallCtx = smallCanvas.getContext('2d');
      if (smallCtx) {
        smallCtx.drawImage(canvas, 0, 0, 540, 675);
        bestDataUrl = smallCanvas.toDataURL(mime, 0.56);
        bestBytes = estimateDataUrlBytes(bestDataUrl);
        return {
          dataUrl: bestDataUrl,
          sizeBytes: bestBytes,
          width: 540,
          height: 675,
          format,
        };
      }
    }

    return {
      dataUrl: bestDataUrl,
      sizeBytes: bestBytes,
      width: targetW,
      height: targetH,
      format,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function subscribeTotemScreensaverSlides(
  onSlides: (slides: ScreensaverSlide[]) => void
): () => void {
  const slideMap = new Map<number, ScreensaverSlide>();

  const emitSorted = () => {
    const list = Array.from(slideMap.values()).sort((a, b) => a.slot - b.slot);
    onSlides(list);
  };

  const unsubscribers: Array<() => void> = [];

  for (let slot = 1; slot <= SCREENSAVER_MAX_SLOTS; slot++) {
    const unsub = onSnapshot(
      getSlideDocRef(slot),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<ScreensaverSlide>;
          if (typeof data.image === 'string' && data.image.trim()) {
            slideMap.set(slot, {
              slot,
              image: data.image,
              sizeBytes: Number(data.sizeBytes || estimateDataUrlBytes(data.image)),
              width: Number(data.width || 720),
              height: Number(data.height || 900),
              format: data.format || 'webp',
              updatedAt: data.updatedAt || '',
            });
          } else {
            slideMap.delete(slot);
          }
        } else {
          slideMap.delete(slot);
        }
        emitSorted();
      },
      (err) => {
        console.warn(`[screensaver] Listener warning for slide ${slot}:`, err);
      }
    );
    unsubscribers.push(unsub);
  }

  return () => {
    unsubscribers.forEach((fn) => fn());
  };
}

export async function saveScreensaverSlide(
  slot: number,
  compressed: CompressedScreensaverResult
): Promise<void> {
  const safeSlot = Math.min(SCREENSAVER_MAX_SLOTS, Math.max(1, Math.round(slot)));
  const payload: ScreensaverSlide = {
    slot: safeSlot,
    image: compressed.dataUrl,
    sizeBytes: compressed.sizeBytes,
    width: compressed.width,
    height: compressed.height,
    format: compressed.format,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(getSlideDocRef(safeSlot), payload);
}

export async function deleteScreensaverSlide(slot: number): Promise<void> {
  await deleteDoc(getSlideDocRef(slot));
}
