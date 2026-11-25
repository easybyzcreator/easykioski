import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';

function resolveServerPort(): number {
  const portFlagIdx = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const cliPort = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
  }
  const envPort = Number(process.env.PORT);
  if (isProd && Number.isFinite(envPort) && envPort > 0) {
    return envPort;
  }
  if (!isProd && Number.isFinite(envPort) && envPort > 0 && envPort !== 8080) {
    return envPort;
  }
  return 3000;
}

const PORT = resolveServerPort();

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'American English (US restaurant & patisserie hospitality style)',
  es: 'Neutral Latin American / US Spanish (hospitality & gastronomy style)',
  pt: 'Brazilian Portuguese (gastronomy & patisserie style)',
};

interface TranslationInputItem {
  id: string;
  kind: 'category' | 'product' | 'side';
  title: string;
  description?: string;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractCleanApiErrorMessage(err: any): string {
  const raw = String(err?.message || '').trim();
  const status = Number(err?.status || 0);
  if (
    status === 503 ||
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand')
  ) {
    return 'O serviço de tradução está temporariamente sobrecarregado. Aguarde alguns segundos e tente novamente.';
  }
  if (status === 429 || raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return 'Limite temporário de traduções atingido. Aguarde alguns segundos e tente novamente.';
  }
  if (raw.includes('GEMINI_API_KEY')) {
    return 'Chave da API de tradução não configurada no servidor.';
  }
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) return String(parsed.error.message);
    } catch {
      // ignore JSON parse failure
    }
  }
  return raw || 'Falha ao traduzir os textos. Tente novamente.';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err: any = new Error('Tempo limite excedido ao traduzir.');
          err.status = 504;
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateTranslationWithRetry(
  ai: GoogleGenAI,
  contents: string,
  config: Record<string, any>
) {
  const attempts: Array<{ model: string; delayMs: number; timeoutMs: number }> = [
    { model: 'gemini-3.1-flash-lite', delayMs: 0, timeoutMs: 8000 },
    { model: 'gemini-4-hydrogen', delayMs: 300, timeoutMs: 10000 },
  ];

  let lastError: any = null;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt.delayMs));
    }
    try {
      const attemptConfig =
        attempt.model === 'gemini-3.1-flash-lite'
          ? { ...config, thinkingConfig: undefined }
          : config;
      return await withTimeout(
        ai.models.generateContent({
          model: attempt.model,
          contents,
          config: attemptConfig,
        }),
        attempt.timeoutMs
      );
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || '');
      const status = Number(err?.status || 0);
      const isTransient =
        status === 503 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 504 ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('Tempo limite');
      if (!isTransient) {
        throw err;
      }
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/translate-catalog', async (req, res) => {
    try {
      const { targetLanguage, items } = req.body as {
        targetLanguage?: string;
        items?: TranslationInputItem[];
      };

      if (!targetLanguage || !['en', 'es', 'pt'].includes(targetLanguage)) {
        return res.status(400).json({ error: 'Invalid targetLanguage. Expected en, es, or pt.' });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.json({ translations: [] });
      }

      // Limit each request batch size cleanly
      const sanitizedItems = items.slice(0, 40).map((item) => ({
        id: String(item.id || ''),
        kind: item.kind === 'category' || item.kind === 'side' ? item.kind : 'product',
        title: String(item.title || '').slice(0, 300),
        description: String(item.description || '').slice(0, 1200),
      }));

      const ai = getGeminiClient();
      const targetDesc = LANGUAGE_LABELS[targetLanguage] || 'American English';

      const prompt = [
        `Translate the following restaurant / artisan patisserie menu items into ${targetDesc}.`,
        'Rules:',
        '- Preserve every item "id" and "kind" EXACTLY as provided.',
        '- Translate both "title" and "description" naturally and appetizingly for a premium self-service kiosk menu.',
        '- If an item is already written in the target language, polish it cleanly or keep it faithful without changing meaning.',
        '- Keep iconic culinary names recognizable when appropriate (e.g., Brigadeiro, Churros, Pistachio, Nutella) while translating flavors, ingredients, and descriptions naturally.',
        '- If "description" is empty, return an empty string "".',
        '',
        'Input JSON:',
        JSON.stringify(sanitizedItems),
      ].join('\n');

      const response = await generateTranslationWithRetry(ai, prompt, {
        systemInstruction:
          'You are a gourmet culinary translator specializing in upscale US, Spanish, and Brazilian restaurant & patisserie menus. Return strictly valid JSON matching the requested schema.',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ['id', 'kind', 'title', 'description'],
              },
            },
          },
          required: ['translations'],
        },
      });

      const rawText = (response.text ?? '{"translations":[]}').trim();
      const parsed = JSON.parse(rawText);
      const translations = Array.isArray(parsed?.translations) ? parsed.translations : [];

      return res.json({ translations });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 500;
      console.error('[api/translate-catalog] Error:', err?.message || err);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: extractCleanApiErrorMessage(err),
      });
    }
  });

  app.post('/api/translate-multilingual', async (req, res) => {
    try {
      const { items } = req.body as {
        items?: Array<{
          id?: string;
          kind?: 'category' | 'product' | 'side';
          title?: string;
          description?: string;
          ingredients?: string;
        }>;
      };

      if (!Array.isArray(items) || items.length === 0) {
        return res.json({ items: [] });
      }

      const sanitizedItems = items.slice(0, 20).map((item, idx) => ({
        id: String(item.id || `item_${idx}`),
        kind: item.kind === 'category' || item.kind === 'side' ? item.kind : 'product',
        title: String(item.title || '').slice(0, 300),
        description: String(item.description || '').slice(0, 1200),
        ingredients: String(item.ingredients || '').slice(0, 800),
      }));

      const ai = getGeminiClient();

      const prompt = [
        'Translate each restaurant / patisserie menu item below into ALL THREE languages: American English (en), Neutral US/Latin American Spanish (es), and Brazilian Portuguese (pt).',
        'Rules:',
        '- Preserve every item "id" and "kind" EXACTLY as provided.',
        '- Detect the source language automatically and produce natural, appetizing hospitality translations for all 3 languages (en, es, pt).',
        '- For the source language itself, keep the original wording or polish it cleanly without changing meaning.',
        '- Keep iconic culinary names recognizable when appropriate (e.g., Açaí, Brigadeiro, Churros, Pistachio, Nutella, Pão de Mel) while translating flavors, ingredients, and descriptions naturally.',
        '- If "description" is empty, return "" for description_en, description_es, and description_pt.',
        '- If "ingredients" is empty, return "" for ingredients_en, ingredients_es, and ingredients_pt.',
        '',
        'Input JSON:',
        JSON.stringify(sanitizedItems),
      ].join('\n');

      const response = await generateTranslationWithRetry(ai, prompt, {
        systemInstruction:
          'You are a gourmet culinary translator specializing in upscale US, Spanish, and Brazilian restaurant & patisserie menus. Return strictly valid JSON matching the requested schema.',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  title_en: { type: Type.STRING },
                  title_es: { type: Type.STRING },
                  title_pt: { type: Type.STRING },
                  description_en: { type: Type.STRING },
                  description_es: { type: Type.STRING },
                  description_pt: { type: Type.STRING },
                  ingredients_en: { type: Type.STRING },
                  ingredients_es: { type: Type.STRING },
                  ingredients_pt: { type: Type.STRING },
                },
                required: [
                  'id',
                  'kind',
                  'title_en',
                  'title_es',
                  'title_pt',
                  'description_en',
                  'description_es',
                  'description_pt',
                  'ingredients_en',
                  'ingredients_es',
                  'ingredients_pt',
                ],
              },
            },
          },
          required: ['items'],
        },
      });

      const rawText = (response.text ?? '{"items":[]}').trim();
      const parsed = JSON.parse(rawText);
      const translatedItems = Array.isArray(parsed?.items) ? parsed.items : [];

      return res.json({ items: translatedItems });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 500;
      console.error('[api/translate-multilingual] Error:', err?.message || err);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: extractCleanApiErrorMessage(err),
      });
    }
  });

  // Never let unknown /api/* requests fall through to index.html (prevents "<!doctype ... is not valid JSON")
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Rota de API não encontrada.' });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !disableHmr,
        watch: disableHmr ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Easy Totem server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Easy Totem server:', err);
  process.exit(1);
});
