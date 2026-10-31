import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { GEMINI_CONFIG } from './src/config/gemini.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Dedicated server-side Gemini client utility using centralized config
const GEMINI_MODEL = GEMINI_CONFIG.MODEL_NAME;
const GEMINI_IMAGE_MODEL = GEMINI_CONFIG.IMAGE_MODEL_NAME;
const GEMINI_TTS_MODEL = GEMINI_CONFIG.TTS_MODEL_NAME;

const SAMPLE_ROOM_THEMES = [
  'student bedroom',
  'studio flat',
  'living room',
  'kitchen',
  'home office',
  'hallway with boxes',
  'bedroom with wardrobe',
  'living room with bookshelf and TV',
  'flatshare bedroom',
  'small dining area',
] as const;

const generatedRoomCache = new Map<
  string,
  { mimeType: string; base64Data: string; theme: string; prompt: string }
>();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment');
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

/**
 * Helper to retry Gemini calls up to 3 times with exponential backoff on 503/429
 */
async function callGeminiWithRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const status =
        err?.status ||
        err?.statusCode ||
        (err?.message?.includes('429') ? 429 : err?.message?.includes('503') ? 503 : 0);
      const isTransient =
        status === 429 ||
        status === 503 ||
        (err?.message &&
          (err.message.includes('Resource has been exhausted') ||
            err.message.includes('overloaded')));

      console.warn(`[Gemini API] Attempt ${attempt} failed with error:`, err?.message || err);

      if (attempt >= retries || !isTransient) {
        throw err;
      }

      const backoff = delayMs * Math.pow(2, attempt - 1);
      console.log(`[Gemini API] Retrying in ${backoff}ms...`);
      await new Promise((res) => setTimeout(res, backoff));
    }
  }
  throw new Error('Max retries exceeded');
}

// -------------------------------------------------------------
// POST /api/gemini/detect-items
// Strict JSON schema for detected inventory items + 2D bounding boxes from images
// -------------------------------------------------------------
app.post('/api/gemini/detect-items', async (req, res) => {
  const { images } = req.body; // array of { mimeType: string, data: string (base64) }

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Please provide at least one image' });
  }

  const prompt = `Analyze this room/belongings photo for moving house in London.
Identify all distinct furniture, appliances, boxes, and personal belongings.
Estimate realistic real-world dimensions in centimetres (cm) and approximate weight in kilograms (kg) using standard UK references:
- Doors are typically ≈ 200 cm high and ≈ 76-80 cm wide
- Standard UK double mattress: 135 x 190 x 25 cm (~30kg)
- Standard UK single mattress: 90 x 190 x 20 cm (~20kg)
- Standard 2-seater sofa: ~150-170 x 85-95 x 85 cm (~45-55kg)
- Standard medium removal box: 45 x 35 x 35 cm (~12-15kg)
- Large removal box: 55 x 45 x 45 cm (~20-25kg)
- Desk: ~120 x 60 x 75 cm (~20-25kg)
- Office chair: ~65 x 65 x 95 cm (~12-15kg)
- Fridge-freezer: ~55-60 x 60 x 145-170 cm (~50-65kg)

For each item:
- name: concise description (e.g. "2-Seat Sofa", "Large Removal Box", "50\\" TV")
- category: "Furniture", "Boxes", "Appliances", "Electronics", "Luggage", or "Misc"
- quantity: integer count of identical items detected
- width_cm, depth_cm, height_cm: integers in cm
- weight_kg: integer in kg
- fragile: boolean (true for TVs, monitors, glassware, mirrors, ceramic plants, delicate lamps)
- can_stack_on_top: boolean (can other heavy boxes be safely stacked ON TOP of this item? False for sofas, chairs, mattresses, open baskets, plants, TVs)
- can_rotate: boolean (can this item be turned sideways/on edge during van loading? False for fridges with compressors, liquids, delicate TVs, plants, irregular chairs)
- confidence: float between 0.0 and 1.0 (if dimensions are uncertain or occluded, set confidence lower, e.g. 0.4 - 0.65)
- reasoning_short: 1 short sentence explaining the reference object used (e.g. "Compared to the door frame ≈ 200cm").
- box_2d: array of 4 integers [ymin, xmin, ymax, xmax] normalized from 0 to 1000 giving the 2D bounding box of this item in the image.
- photo_index: 0-indexed integer indicating which uploaded photo (0 to ${Math.max(0, images.length - 1)}) this item appears in.`;

  const config = {
    thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              category: { type: Type.STRING },
              quantity: { type: Type.INTEGER },
              width_cm: { type: Type.INTEGER },
              depth_cm: { type: Type.INTEGER },
              height_cm: { type: Type.INTEGER },
              weight_kg: { type: Type.INTEGER },
              fragile: { type: Type.BOOLEAN },
              can_stack_on_top: { type: Type.BOOLEAN },
              can_rotate: { type: Type.BOOLEAN },
              confidence: { type: Type.NUMBER },
              reasoning_short: { type: Type.STRING },
              box_2d: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
              },
              photo_index: { type: Type.INTEGER },
            },
            required: [
              'name',
              'category',
              'quantity',
              'width_cm',
              'depth_cm',
              'height_cm',
              'weight_kg',
              'fragile',
              'can_stack_on_top',
              'can_rotate',
              'confidence',
              'reasoning_short',
              'box_2d',
            ],
          },
        },
      },
      required: ['items'],
    },
  };

  console.log('--------------------------------------------------');
  console.log(`[Gemini API Call] /api/gemini/detect-items`);
  console.log(`Model: ${GEMINI_MODEL}`);
  console.log(`Image parts: ${images.length}`);
  console.log('--------------------------------------------------');

  try {
    const ai = getGeminiClient();
    const parts: any[] = images.map((img: { mimeType: string; data: string }) => ({
      inlineData: {
        mimeType: img.mimeType || 'image/jpeg',
        data: img.data,
      },
    }));
    parts.push({ text: prompt });

    const response = await callGeminiWithRetry(async () => {
      return await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: { parts },
        config,
      });
    });

    const outputText = response.text || '{"items": []}';
    console.log('[Gemini API Output /api/gemini/detect-items]:', outputText.slice(0, 500) + '...');

    const parsed = JSON.parse(outputText);
    return res.json({
      success: true,
      items: parsed.items || [],
      telemetry: {
        model: GEMINI_MODEL,
        prompt,
        config,
        output: parsed,
      },
    });
  } catch (err: any) {
    console.error('[Gemini API Error /api/gemini/detect-items]:', err);
    return res.status(500).json({
      success: false,
      error:
        err?.message ||
        'Failed to analyze photos with Gemini. Please try again or use the built-in sample photos.',
    });
  }
});

// -------------------------------------------------------------
// POST /api/gemini/explain-plan
// Dispatcher's Note written by gemini-4-argon grounded strictly in verified JSON
// -------------------------------------------------------------
app.post('/api/gemini/explain-plan', async (req, res) => {
  const { verifiedJson } = req.body;

  if (!verifiedJson) {
    return res.status(400).json({ error: 'Missing verified packer/verifier JSON payload' });
  }

  const serializedJson = JSON.stringify(verifiedJson, null, 2);

  const prompt = `You are the London Removal Dispatcher writing a short handwritten "Dispatcher's Note" on a removal manifest.
Below is the ONLY source of truth — the deterministic packer and verifier output as JSON:

${serializedJson}

STRICT RULES:
1. Write "sentences": exactly 3 short sentences explaining:
   - Sentence 1: Why the recommended van was chosen (mention its price, volume used %, or money saved vs Luton from the JSON).
   - Sentence 2 & 3: Which items were left behind in the smaller failing vans and why (using the leftover items and reasons from the JSON; or if the Small Van already fits everything, state that 0 items were left behind).
2. Write "loading_tips": an array of 2 short, practical loading tips referencing the first/heaviest items and fragile/last items from the JSON loading_sequence.
3. NEVER INVENT, CALCULATE, OR ROUND ANY NUMBERS. Every single number or digit you write in "sentences" or "loading_tips" MUST appear verbatim inside the JSON above. Do not write numbers like "1st", "2nd", "3", or "2" unless that exact number is present in the JSON.`;

  const config = {
    thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        sentences: { type: Type.STRING },
        loading_tips: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ['sentences', 'loading_tips'],
    },
  };

  console.log('--------------------------------------------------');
  console.log(`[Gemini API Call] /api/gemini/explain-plan (Dispatcher's Note)`);
  console.log(`Model: ${GEMINI_MODEL}`);
  console.log('--------------------------------------------------');

  try {
    const ai = getGeminiClient();
    const response = await callGeminiWithRetry(async () => {
      return await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config,
      });
    });

    const outputText = response.text || '{"sentences":"","loading_tips":[]}';
    const parsed = JSON.parse(outputText);

    return res.json({
      success: true,
      note: {
        sentences: String(parsed.sentences || ''),
        loading_tips: Array.isArray(parsed.loading_tips)
          ? parsed.loading_tips.slice(0, 2).map(String)
          : [],
      },
      telemetry: {
        model: GEMINI_MODEL,
        prompt,
        config,
        output: parsed,
      },
    });
  } catch (err: any) {
    console.error('[Gemini API Error /api/gemini/explain-plan]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Could not generate Dispatcher Note from Gemini.',
    });
  }
});

// -------------------------------------------------------------
// POST /api/gemini/voice-step
// Moving-Day Voice Mode (Performer): Translates step text (keeping code numbers verbatim)
// and synthesizes speech via gemini-3.8-flash-tts
// -------------------------------------------------------------
app.post('/api/gemini/voice-step', async (req, res) => {
  const {
    stepNumber,
    totalSteps,
    itemName,
    w_cm,
    d_cm,
    h_cm,
    weight_kg,
    instruction,
    fragile,
    language = 'English',
  } = req.body;

  const baseEnglishText = `Step ${stepNumber} of ${totalSteps}: ${itemName} (${w_cm}×${d_cm}×${h_cm}cm, ${weight_kg}kg). ${instruction}.${
    fragile ? ' Handle with care, fragile item.' : ''
  }`;

  try {
    const ai = getGeminiClient();
    let spokenText = baseEnglishText;

    // 1. If non-English language selected, translate text via gemini-4-argon while copying all numbers from code verbatim
    if (language && language !== 'English') {
      const translatePrompt = `Translate this moving-day loading instruction into ${language}.
CRITICAL RULE: Keep all numbers (${stepNumber}, ${totalSteps}, ${w_cm}, ${d_cm}, ${h_cm}, ${weight_kg}) and units (cm, kg) EXACTLY as digits copied from the source text. Never alter or guess any numbers.
Return ONLY the translated spoken sentence.

Source text:
${baseEnglishText}`;

      try {
        const transRes = await callGeminiWithRetry(async () => {
          return await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: translatePrompt,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
        }, 2, 1000);
        if (transRes.text && transRes.text.trim()) {
          spokenText = transRes.text.trim();
        }
      } catch (transErr) {
        console.warn('[Gemini Translation Fallback]:', transErr);
      }
    }

    // 2. Synthesize calm moving-day speech using gemini-3.8-flash-tts
    let audioBase64: string | null = null;
    try {
      const ttsResponse = await callGeminiWithRetry(async () => {
        return await ai.models.generateContent({
          model: GEMINI_TTS_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: spokenText,
                  speechMetadata: {
                    style: 'Calm, clear, reassuring London removal foreman guiding helpers step by step',
                  },
                } as any,
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });
      }, 2, 1000);

      audioBase64 =
        ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (ttsErr: any) {
      console.warn('[Gemini TTS Fallback to Web Speech API]:', ttsErr?.message || ttsErr);
    }

    return res.json({
      success: true,
      spokenText,
      audioBase64,
      mimeType: 'audio/wav',
      telemetry: {
        translationModel: language !== 'English' ? GEMINI_MODEL : 'deterministic-code',
        ttsModel: GEMINI_TTS_MODEL,
        language,
        spokenText,
        hasAudioWav: Boolean(audioBase64),
      },
    });
  } catch (err: any) {
    return res.json({
      success: true,
      spokenText: baseEnglishText,
      audioBase64: null,
      mimeType: 'audio/wav',
      fallbackReason: err?.message || 'Using browser speechSynthesis fallback',
    });
  }
});

// -------------------------------------------------------------
// POST /api/gemini/generate-room
// Uses gemini-nano-banana-2.1 to generate a realistic photo of a London rented room ready to move
// with server-side in-memory caching.
// -------------------------------------------------------------
app.post('/api/gemini/generate-room', async (req, res) => {
  const requestedTheme = req.body?.theme;
  const theme =
    requestedTheme && SAMPLE_ROOM_THEMES.includes(requestedTheme)
      ? requestedTheme
      : SAMPLE_ROOM_THEMES[Math.floor(Math.random() * SAMPLE_ROOM_THEMES.length)];

  if (generatedRoomCache.has(theme)) {
    const cached = generatedRoomCache.get(theme)!;
    return res.json({
      success: true,
      cached: true,
      theme: cached.theme,
      mimeType: cached.mimeType,
      base64Data: cached.base64Data,
      telemetry: {
        model: GEMINI_IMAGE_MODEL,
        theme: cached.theme,
        prompt: cached.prompt,
        cached: true,
      },
    });
  }

  const prompt = `A realistic wide-angle photograph of a London rented ${theme} ready to move house, showing a full standard UK interior door frame (~200cm high) for scale, clear furniture, cardboard moving boxes, and household belongings on the floor, natural daylight, crisp documentary interior photography.`;

  console.log('--------------------------------------------------');
  console.log(`[Gemini API Call] /api/gemini/generate-room`);
  console.log(`Model: ${GEMINI_IMAGE_MODEL} | Theme: ${theme}`);
  console.log('--------------------------------------------------');

  try {
    const ai = getGeminiClient();
    const response = await callGeminiWithRetry(
      async () => {
        return await ai.models.generateContent({
          model: GEMINI_IMAGE_MODEL,
          contents: {
            parts: [{ text: prompt }],
          },
          config: {
            imageConfig: {
              aspectRatio: '4:3',
              imageSize: '1K',
            },
          },
        });
      },
      2,
      1500
    );

    let base64Data: string | null = null;
    let mimeType = 'image/jpeg';

    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        base64Data = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!base64Data) {
      return res.json({
        success: false,
        theme,
        fallbackReason: 'No image data returned by gemini-nano-banana-2.1; using built-in sample room fallback.',
      });
    }

    generatedRoomCache.set(theme, {
      mimeType,
      base64Data,
      theme,
      prompt,
    });

    return res.json({
      success: true,
      cached: false,
      theme,
      mimeType,
      base64Data,
      telemetry: {
        model: GEMINI_IMAGE_MODEL,
        theme,
        prompt,
        cached: false,
      },
    });
  } catch (err: any) {
    console.warn('[Gemini Image Generation Fallback]:', err?.message || err);
    return res.json({
      success: false,
      theme,
      fallbackReason:
        err?.message || 'Image generation unavailable; falling back to built-in London room survey photo.',
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VanPack 3D Server] Running on http://0.0.0.0:${PORT} (Node ${process.version})`);
  });
}

startServer().catch((err) => {
  console.error('[VanPack 3D Server] Fatal start error:', err);
  process.exit(1);
});
