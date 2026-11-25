import { GoogleGenAI, Type } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'GEMINI_API_KEY não configurada no servidor.' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      res.status(200).json({ items: [] });
      return;
    }

    const sanitizedItems = items.slice(0, 20).map((item: any, idx: number) => ({
      id: String(item.id || `item_${idx}`),
      kind: item.kind === 'category' || item.kind === 'side' ? item.kind : 'product',
      title: String(item.title || '').slice(0, 300),
      description: String(item.description || '').slice(0, 1200),
      ingredients: String(item.ingredients || '').slice(0, 800),
    }));

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = [
      'Translate each restaurant / patisserie menu item below into ALL THREE languages: American English (en), Neutral US/Latin American Spanish (es), and Brazilian Portuguese (pt).',
      'Rules:',
      '- Preserve every item "id" and "kind" EXACTLY as provided.',
      '- Detect the source language automatically and produce natural, appetizing hospitality translations for all 3 languages (en, es, pt).',
      '- Keep iconic culinary names recognizable when appropriate (e.g., Açaí, Brigadeiro, Churros, Pistachio, Nutella, Catupiry) while translating flavors, ingredients, and descriptions naturally.',
      '- If "description" is empty, return "" for description_en, description_es, and description_pt.',
      '- If "ingredients" is empty, return "" for ingredients_en, ingredients_es, and ingredients_pt.',
      '',
      'Input JSON:',
      JSON.stringify(sanitizedItems),
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a gourmet culinary translator specializing in upscale US, Spanish, and Brazilian restaurant & patisserie menus. Return strictly valid JSON matching the requested schema.',
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
      },
    });

    const rawText = (response.text ?? '{"items":[]}').trim();
    const parsed = JSON.parse(rawText);
    const translatedItems = Array.isArray(parsed?.items) ? parsed.items : [];

    res.status(200).json({ items: translatedItems });
  } catch (err: any) {
    console.error('[vercel api/translate-multilingual] Error:', err?.message || err);
    res.status(500).json({ error: String(err?.message || 'Erro ao traduzir os textos.') });
  }
}
