import { Language, ExtractedPage, TranslatedPage, LanguageTranslationState } from '../types';
import { PDFDocumentSession } from './pdfReader';
import { generateTranslatedPDF } from './pdfGenerator';

interface TranslateSinglePageParams {
  text?: string;
  imageBase64?: string;
  targetLanguage: string;
  pageNumber: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a single page to the backend translation proxy with exponential backoff retry.
 */
async function translatePageWithRetry(
  params: TranslateSinglePageParams,
  abortSignal?: AbortSignal,
  maxRetries = 3
): Promise<string> {
  let attempt = 0;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    if (abortSignal?.aborted) {
      throw new Error('Translation was cancelled.');
    }

    try {
      const response = await fetch('/api/translate-page', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();
      return data.translatedText ?? '';
    } catch (err: any) {
      if (abortSignal?.aborted) {
        throw new Error('Translation was cancelled.');
      }

      attempt++;
      lastError = err;
      if (attempt <= maxRetries) {
        const delay = Math.min(Math.pow(2, attempt) * 1000 + Math.random() * 500, 6000);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Failed to translate page ${params.pageNumber}`);
}

/**
 * Concurrency Limiter with max 3 active concurrent requests.
 */
class ConcurrencyPool {
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrency = 3) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next?.();
      }
    }
  }
}

/**
 * High-performance translation pipeline:
 * 1. Opens PDFDocumentSession once to eliminate redundant PDF parsing.
 * 2. Caches extracted pages across all languages.
 * 3. Dispatches translation tasks across all pages and languages concurrently (max 3 workers).
 * 4. Generates translated PDFs per language upon completion.
 */
export async function runTranslationPipeline(
  file: File,
  totalPages: number,
  languages: Language[],
  onProgress: (langCode: string, update: Partial<LanguageTranslationState>) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const session = await PDFDocumentSession.open(file);
  const extractedPagesCache = new Map<number, ExtractedPage>();
  const concurrencyPool = new ConcurrencyPool(3);

  // Thread-safe helper to get or extract a page once
  const pageExtractionLocks = new Map<number, Promise<ExtractedPage>>();
  const getPage = async (pageNumber: number): Promise<ExtractedPage> => {
    if (extractedPagesCache.has(pageNumber)) {
      return extractedPagesCache.get(pageNumber)!;
    }
    if (!pageExtractionLocks.has(pageNumber)) {
      const lockPromise = session.extractPage(pageNumber).then((page) => {
        extractedPagesCache.set(pageNumber, page);
        pageExtractionLocks.delete(pageNumber);
        return page;
      });
      pageExtractionLocks.set(pageNumber, lockPromise);
    }
    return pageExtractionLocks.get(pageNumber)!;
  };

  try {
    // Process each target language
    const languagePromises = languages.map(async (language) => {
      try {
        if (abortSignal?.aborted) {
          throw new Error('Translation was cancelled.');
        }

        onProgress(language.code, {
          status: 'translating',
          currentPage: 0,
          totalPages,
        });

        const translatedPages: TranslatedPage[] = new Array(totalPages);
        let completedPagesCount = 0;

        // Create tasks for all pages in parallel through the concurrency pool
        const pageTasks = Array.from({ length: totalPages }, (_, i) => i + 1).map(
          async (pageNum) => {
            if (abortSignal?.aborted) {
              throw new Error('Translation was cancelled.');
            }

            // 1. Get cached or extracted original page
            const extractedPage = await getPage(pageNum);

            if (abortSignal?.aborted) {
              throw new Error('Translation was cancelled.');
            }

            // 2. Translate with concurrency pool (max 3 concurrent)
            const translatedText = await concurrencyPool.run(async () => {
              if (extractedPage.isScanned && extractedPage.imageBase64) {
                return await translatePageWithRetry(
                  {
                    imageBase64: extractedPage.imageBase64,
                    targetLanguage: language.name,
                    pageNumber: pageNum,
                  },
                  abortSignal
                );
              } else {
                return await translatePageWithRetry(
                  {
                    text: extractedPage.text,
                    targetLanguage: language.name,
                    pageNumber: pageNum,
                  },
                  abortSignal
                );
              }
            });

            // Store in exact page index to preserve strict page ordering
            translatedPages[pageNum - 1] = {
              pageNumber: pageNum,
              translatedText,
              isScanned: extractedPage.isScanned,
              width: extractedPage.width,
              height: extractedPage.height,
            };

            completedPagesCount++;
            onProgress(language.code, {
              status: 'translating',
              currentPage: completedPagesCount,
              totalPages,
            });
          }
        );

        // Wait for all pages of this language to finish
        await Promise.all(pageTasks);

        if (abortSignal?.aborted) {
          throw new Error('Translation was cancelled.');
        }

        // 3. Compile final PDF document
        onProgress(language.code, {
          status: 'generating_pdf',
          currentPage: totalPages,
          totalPages,
        });

        const { blob, downloadUrl, fileSizeBytes } = await generateTranslatedPDF(
          translatedPages,
          language
        );

        const baseName = file.name.replace(/\.pdf$/i, '');
        const outputFileName = `${baseName}_${language.name.toLowerCase()}.pdf`;

        onProgress(language.code, {
          status: 'completed',
          currentPage: totalPages,
          totalPages,
          downloadUrl,
          pdfBlob: blob,
          outputFileName,
          fileSizeBytes,
        });
      } catch (err: any) {
        if (abortSignal?.aborted) {
          onProgress(language.code, {
            status: 'idle',
            error: undefined,
          });
          return;
        }

        onProgress(language.code, {
          status: 'error',
          error: err.message || `Failed to translate to ${language.name}`,
        });
      }
    });

    await Promise.all(languagePromises);
  } finally {
    session.destroy();
  }
}
