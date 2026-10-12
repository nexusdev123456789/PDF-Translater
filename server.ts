import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON with support for OCR base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to wait
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cached GoogleGenAI instance
let cachedAI: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Please add your Gemini API key to environment variables.');
  }
  if (!cachedAI) {
    cachedAI = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAI;
}

// Translation API endpoint
app.post('/api/translate-page', async (req, res) => {
  const { text, imageBase64, targetLanguage, pageNumber } = req.body;

  if (!targetLanguage) {
    return res.status(400).json({ error: 'targetLanguage is required' });
  }

  // Fast path for empty page content
  if (!imageBase64 && (!text || text.trim().length === 0)) {
    return res.json({
      pageNumber: pageNumber || 1,
      translatedText: '',
      isScanned: false,
    });
  }

  let ai: GoogleGenAI;
  try {
    ai = getAIClient();
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }

  // Retry logic with exponential backoff (up to 3 retries)
  const maxRetries = 3;
  let attempt = 0;
  let lastError: any = null;

  const candidateModels = [
    process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest',
  ];
  let activeModel = candidateModels[0];

  while (attempt <= maxRetries) {
    try {
      if (imageBase64) {
        // Scanned page fallback: extract and translate using multimodal Gemini
        const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

        const response = await ai.models.generateContent({
          model: activeModel,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
                {
                  text: `This is a scanned page (page ${pageNumber || 1}) of a document.
Extract all readable text from this page and translate it directly into ${targetLanguage}.
Requirements:
1. Translate accurately into ${targetLanguage}.
2. Maintain paragraph breaks, headers, lists, and reading order.
3. Translate ONLY. Do not include notes, preambles, metadata, or commentary.
4. Output only the translated text.`,
                },
              ],
            },
          ],
          config: {
            temperature: 0.1,
          },
        });

        const translatedText = response.text?.trim() || '';
        return res.json({
          pageNumber: pageNumber || 1,
          translatedText,
          isScanned: true,
        });
      } else {
        // Text-based translation
        const prompt = `Translate the following page content (page ${pageNumber || 1}) into ${targetLanguage}.
Requirements:
1. Translate accurately and naturally into ${targetLanguage}.
2. Preserve all paragraph breaks, spacing, bullet points, numbers, and document structure.
3. Translate ONLY. Do NOT add greetings, disclaimers, explanations, footnotes, or commentary.
4. Output only the translated content.

Original text:
${text}`;

        const response = await ai.models.generateContent({
          model: activeModel,
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          config: {
            systemInstruction:
              'You are a high-fidelity document translator. Translate the text directly into the requested target language while strictly preserving paragraph structure and numbering. Output only the translation without any commentary.',
            temperature: 0.1,
          },
        });

        const translatedText = response.text?.trim() || '';
        return res.json({
          pageNumber: pageNumber || 1,
          translatedText,
          isScanned: false,
        });
      }
    } catch (err: any) {
      attempt++;
      lastError = err;
      if (attempt < candidateModels.length) {
        activeModel = candidateModels[attempt];
      }
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('Quota');

      if (attempt <= maxRetries) {
        const baseDelay = isRateLimit ? 2000 : 800;
        const delay = Math.min(Math.pow(2, attempt) * baseDelay + Math.random() * 400, 6000);
        await sleep(delay);
      }
    }
  }

  return res.status(500).json({
    error: lastError?.message || 'Translation failed after multiple retries. Please verify your Gemini API key and quota.',
    pageNumber,
  });
});

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const portNumber = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
  app.listen(portNumber, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${portNumber}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
