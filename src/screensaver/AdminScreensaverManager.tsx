import React, { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { Clock, Eye, Image as ImageIcon, Loader2, MonitorPlay, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../firebase';
import { Settings } from '../types';
import {
  compressScreensaverImage,
  deleteScreensaverSlide,
  saveScreensaverSlide,
  SCREENSAVER_MAX_SLOTS,
  ScreensaverSlide,
  subscribeTotemScreensaverSlides,
} from './screensaverStorage';

interface AdminScreensaverManagerProps {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

export const AdminScreensaverManager: React.FC<AdminScreensaverManagerProps> = ({
  settings,
  setSettings,
}) => {
  const [slides, setSlides] = useState<ScreensaverSlide[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<number | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    const unsub = subscribeTotemScreensaverSlides(setSlides);
    return () => unsub();
  }, []);

  // Auto-advance preview slideshow when testing
  useEffect(() => {
    if (previewIndex === null || slides.length <= 1) return;
    const intervalSec = Math.max(3, Number(settings?.screensaverIntervalSeconds || 6));
    const timer = window.setInterval(() => {
      setPreviewIndex((prev) => (prev === null ? null : (prev + 1) % slides.length));
    }, intervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [previewIndex, slides.length, settings?.screensaverIntervalSeconds]);

  const totalKb = Math.round(
    slides.reduce((acc, s) => acc + (s.sizeBytes || 0), 0) / 1024
  );

  const persistScreensaverPrefs = async (
    patch: Partial<Pick<Settings, 'screensaverEnabled' | 'screensaverIdleSeconds' | 'screensaverIntervalSeconds'>>,
    successToast?: string
  ) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSavingToggle(true);
    try {
      await setDoc(doc(db, 'configuracoes', 'geral'), patch, { merge: true });
      if (successToast) toast.success(successToast);
    } catch (err) {
      console.error('Erro ao salvar preferência da tela de descanso:', err);
      toast.error('Erro ao salvar configuração da tela de descanso.');
    } finally {
      setSavingToggle(false);
    }
  };

  const handleUploadSlot = async (
    slot: number,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    setUploadingSlot(slot);
    try {
      const compressed = await compressScreensaverImage(file);
      await saveScreensaverSlide(slot, compressed);
      const kb = Math.max(1, Math.round(compressed.sizeBytes / 1024));
      toast.success(
        `Imagem ${slot} compactada (${kb} KB · ${compressed.format.toUpperCase()}) e salva!`
      );
    } catch (err: any) {
      console.error('Erro ao salvar imagem da tela de descanso:', err);
      toast.error(err?.message || 'Erro ao compactar e salvar a imagem.');
    } finally {
      setUploadingSlot(null);
      input.value = '';
    }
  };

  const handleDeleteSlot = async (slot: number) => {
    setDeletingSlot(slot);
    try {
      await deleteScreensaverSlide(slot);
      toast.success(`Imagem ${slot} removida da Tela de Descanso.`);
    } catch (err) {
      console.error('Erro ao remover imagem da tela de descanso:', err);
      toast.error('Erro ao remover a imagem.');
    } finally {
      setDeletingSlot(null);
    }
  };

  const slots = Array.from({ length: SCREENSAVER_MAX_SLOTS }, (_, idx) => idx + 1);
  const previewSlide = previewIndex !== null ? slides[previewIndex % Math.max(1, slides.length)] : null;

  return (
    <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-stone-200 pb-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">
            Exclusivo para o Totem na Loja
          </span>
          <h4 className="text-base font-serif font-black text-stone-900 flex items-center gap-2 mt-0.5">
            <MonitorPlay size={18} /> Tela de Descanso do Totem (5 Imagens 1080 × 1350)
          </h4>
          <p className="text-xs text-stone-600 mt-0.5">
            Exibe suas imagens em tela cheia quando ninguém estiver usando o Totem. As imagens são compactadas automaticamente em WebP ultraleve e salvas separadamente para não pesar nas configurações gerais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {slides.length > 0 && (
            <button
              type="button"
              onClick={() => setPreviewIndex(0)}
              className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Eye size={14} /> Testar Agora
            </button>
          )}

          <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer select-none">
            <span className="text-xs font-bold text-stone-900">
              {savingToggle ? 'Salvando...' : 'Ativar Tela de Descanso'}
            </span>
            <input
              type="checkbox"
              checked={Boolean(settings?.screensaverEnabled)}
              onChange={(e) => {
                const next = e.target.checked;
                persistScreensaverPrefs(
                  {
                    screensaverEnabled: next,
                    screensaverIdleSeconds: Math.max(5, Number(settings?.screensaverIdleSeconds || 45)),
                    screensaverIntervalSeconds: Math.max(3, Number(settings?.screensaverIntervalSeconds || 6)),
                  },
                  next
                    ? 'Tela de Descanso ativada e salva no Totem!'
                    : 'Tela de Descanso desativada no Totem.'
                );
              }}
              className="w-5 h-5 accent-stone-900 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Timings + Compact Storage Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1">
            <Clock size={12} /> Ativar após inatividade (seg)
          </label>
          <input
            type="number"
            min="5"
            max="600"
            value={settings?.screensaverIdleSeconds ?? 45}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                screensaverIdleSeconds: Math.max(5, parseInt(e.target.value, 10) || 45),
              }))
            }
            onBlur={(e) => {
              const val = Math.max(5, parseInt(e.target.value, 10) || 45);
              persistScreensaverPrefs({ screensaverIdleSeconds: val });
            }}
            className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1">
            <Clock size={12} /> Trocar imagem a cada (seg)
          </label>
          <input
            type="number"
            min="3"
            max="60"
            value={settings?.screensaverIntervalSeconds ?? 6}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                screensaverIntervalSeconds: Math.max(3, parseInt(e.target.value, 10) || 6),
              }))
            }
            onBlur={(e) => {
              const val = Math.max(3, parseInt(e.target.value, 10) || 6);
              persistScreensaverPrefs({ screensaverIntervalSeconds: val });
            }}
            className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900"
          />
        </div>

        <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-col justify-center">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
            Status & Espaço Compactado
          </span>
          <p className="text-xs font-bold text-emerald-950 mt-0.5">
            {slides.length} / {SCREENSAVER_MAX_SLOTS} imagens · {totalKb} KB ·{' '}
            {settings?.screensaverEnabled && slides.length > 0 ? 'Ativo no Totem' : 'Inativo'}
          </p>
        </div>
      </div>

      {/* 5 Slots (4:5 ratio = 1080 x 1350) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {slots.map((slot) => {
          const slide = slides.find((s) => s.slot === slot);
          const isUploading = uploadingSlot === slot;
          const isDeleting = deletingSlot === slot;
          const kb = slide ? Math.max(1, Math.round(slide.sizeBytes / 1024)) : 0;

          return (
            <div
              key={slot}
              className="rounded-2xl bg-white border border-stone-200 overflow-hidden flex flex-col shadow-2xs"
            >
              <div className="relative aspect-[4/5] bg-stone-100 flex items-center justify-center overflow-hidden">
                {slide ? (
                  <>
                    <img
                      src={slide.image}
                      alt={`Slide ${slot}`}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/70 text-white text-[9px] font-bold">
                      #{slot} · {kb} KB
                    </span>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDeleteSlot(slot)}
                      title={`Remover imagem ${slot}`}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow cursor-pointer"
                    >
                      {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </>
                ) : (
                  <div className="text-center p-3 text-stone-400 space-y-1">
                    <ImageIcon size={24} className="mx-auto opacity-60" />
                    <p className="text-[10px] font-bold">Slide {slot}</p>
                    <p className="text-[9px]">1080 × 1350</p>
                  </div>
                )}

                {isUploading && (
                  <div className="absolute inset-0 bg-black/60 text-white flex flex-col items-center justify-center gap-1.5">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-[10px] font-bold">Compactando...</span>
                  </div>
                )}
              </div>

              <label className="p-2 bg-stone-50 hover:bg-stone-100 border-t border-stone-200 text-[11px] font-bold text-stone-800 flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                <Upload size={12} />
                <span>{slide ? 'Trocar' : 'Enviar'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploading}
                  onChange={(e) => handleUploadSlot(slot, e)}
                />
              </label>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-stone-500">
        Dica: para testar rapidamente no Totem, você pode colocar <strong>10 segundos</strong> de inatividade ou clicar em <strong>Testar Agora</strong> acima.
      </p>

      {/* Instant Fullscreen Preview Modal inside Admin */}
      {previewSlide && (
        <div
          onClick={() => setPreviewIndex(null)}
          className="fixed inset-0 z-[120] bg-black flex items-center justify-center cursor-pointer select-none"
        >
          <img
            src={previewSlide.image}
            alt={`Prévia Slide ${previewSlide.slot}`}
            className="w-full h-full object-cover"
          />
          <div className="pointer-events-none fixed inset-x-0 bottom-8 flex flex-col items-center gap-3 px-4">
            <div className="px-6 py-3 rounded-full bg-black/75 border border-white/25 text-white text-sm font-bold shadow-2xl">
              Prévia da Tela de Descanso (Slide {previewSlide.slot}) · Clique em qualquer lugar para fechar
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
