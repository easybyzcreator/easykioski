import React, { useEffect, useState } from 'react';
import { Clock, Image as ImageIcon, Loader2, MonitorPlay, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
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

  useEffect(() => {
    const unsub = subscribeTotemScreensaverSlides(setSlides);
    return () => unsub();
  }, []);

  const totalKb = Math.round(
    slides.reduce((acc, s) => acc + (s.sizeBytes || 0), 0) / 1024
  );

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
        `Imagem ${slot} compactada (${kb} KB · ${compressed.format.toUpperCase()}) e salva na pasta da Tela de Descanso!`
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
            Exibe suas imagens em tela cheia quando ninguém estiver usando o Totem. As imagens são compactadas automaticamente em WebP ultraleve e salvas em uma coleção separada para não ocupar espaço nas configurações gerais.
          </p>
        </div>

        <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white border border-stone-200 cursor-pointer shrink-0 select-none">
          <span className="text-xs font-bold text-stone-900">Ativar Tela de Descanso</span>
          <input
            type="checkbox"
            checked={Boolean(settings?.screensaverEnabled)}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, screensaverEnabled: e.target.checked }))
            }
            className="w-5 h-5 accent-stone-900 cursor-pointer"
          />
        </label>
      </div>

      {/* Timings + Compact Storage Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1">
            <Clock size={12} /> Ativar após inatividade (seg)
          </label>
          <input
            type="number"
            min="10"
            max="600"
            value={settings?.screensaverIdleSeconds ?? 45}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                screensaverIdleSeconds: Math.max(10, parseInt(e.target.value, 10) || 45),
              }))
            }
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
            className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900"
          />
        </div>

        <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-col justify-center">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
            Espaço Compactado (Pasta Separada)
          </span>
          <p className="text-xs font-bold text-emerald-950 mt-0.5">
            {slides.length} / {SCREENSAVER_MAX_SLOTS} imagens · {totalKb} KB no total
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
        As imagens sobem na hora para a pasta separada (<strong className="font-mono">totem_screensaver</strong>). Lembre-se de clicar em <strong>Salvar Configurações</strong> após ativar a opção ou alterar os tempos.
      </p>
    </div>
  );
};
