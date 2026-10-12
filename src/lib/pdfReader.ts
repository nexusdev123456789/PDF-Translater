import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedPage } from '../types';

// Configure the clean standalone worker to eliminate Vite module injection syntax errors
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.worker.min.mjs`;

/**
 * Reusable PDF Document Session.
 * Loads the PDF document once into memory, preventing expensive re-parsing per page.
 */
export class PDFDocumentSession {
  private pdfDoc: pdfjsLib.PDFDocumentProxy;
  readonly numPages: number;

  private constructor(pdfDoc: pdfjsLib.PDFDocumentProxy) {
    this.pdfDoc = pdfDoc;
    this.numPages = pdfDoc.numPages;
  }

  static async open(file: File): Promise<PDFDocumentSession> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/cmaps/',
      cMapPacked: true,
      // Omit invalid standardFontDataUrl to prevent 404 network console errors
      verbosity: 0,
    });
    const pdfDoc = await loadingTask.promise;
    return new PDFDocumentSession(pdfDoc);
  }

  /**
   * Extracts text or renders OCR image for a single page.
   */
  async extractPage(pageNumber: number): Promise<ExtractedPage> {
    const page = await this.pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });

    try {
      // 1. Extract text items and preserve paragraph breaks
      const textContent = await page.getTextContent();
      const extractedLines: string[] = [];
      let currentLine = '';
      let lastY: number | null = null;

      for (const item of textContent.items) {
        if ('str' in item && item.str) {
          const transform = (item as any).transform;
          const currentY = transform ? transform[5] : null;

          if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
            if (currentLine.trim()) {
              extractedLines.push(currentLine.trim());
            }
            currentLine = item.str;
          } else {
            currentLine += (currentLine ? ' ' : '') + item.str;
          }
          lastY = currentY;
        }
      }

      if (currentLine.trim()) {
        extractedLines.push(currentLine.trim());
      }

      const cleanText = extractedLines.join('\n').trim();

      // 2. Determine if page is a scanned image (fewer than 15 characters)
      const isScanned = cleanText.length < 15;
      let imageBase64: string | undefined = undefined;

      if (isScanned) {
        // Render canvas for OCR with balanced scale for speed and clarity
        const ocrScale = 1.3;
        const ocrViewport = page.getViewport({ scale: ocrScale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(ocrViewport.width);
        canvas.height = Math.floor(ocrViewport.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await page.render({
            canvas,
            canvasContext: ctx,
            viewport: ocrViewport,
          }).promise;

          // JPEG at 0.8 quality produces lightweight ~150-250KB payload
          imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
        }
      }

      return {
        pageNumber,
        text: cleanText,
        isScanned,
        imageBase64,
        width: viewport.width,
        height: viewport.height,
      };
    } finally {
      // Free page memory immediately
      page.cleanup();
    }
  }

  destroy(): void {
    try {
      this.pdfDoc.cleanup();
      if (typeof (this.pdfDoc as any).destroy === 'function') {
        (this.pdfDoc as any).destroy();
      }
    } catch {
      // Silent cleanup
    }
  }
}

export async function getPDFPageCount(file: File): Promise<number> {
  const session = await PDFDocumentSession.open(file);
  const count = session.numPages;
  session.destroy();
  return count;
}

export async function extractSinglePage(
  file: File,
  pageNumber: number
): Promise<ExtractedPage> {
  const session = await PDFDocumentSession.open(file);
  try {
    return await session.extractPage(pageNumber);
  } finally {
    session.destroy();
  }
}
