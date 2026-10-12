import { jsPDF } from 'jspdf';
import { Language, TranslatedPage } from '../types';

// Shared offscreen canvas for measuring text dimensions
let sharedMeasureCanvas: HTMLCanvasElement | null = null;
function getMeasureContext(font: string, isRTL: boolean): CanvasRenderingContext2D {
  if (!sharedMeasureCanvas) {
    sharedMeasureCanvas = document.createElement('canvas');
  }
  const ctx = sharedMeasureCanvas.getContext('2d')!;
  ctx.font = font;
  ctx.direction = isRTL ? 'rtl' : 'ltr';
  return ctx;
}

// Single shared render canvas to prevent out-of-memory on large (up to 200+ pages) PDFs
let sharedRenderCanvas: HTMLCanvasElement | null = null;
function getRenderCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!sharedRenderCanvas) {
    sharedRenderCanvas = document.createElement('canvas');
  }
  if (sharedRenderCanvas.width !== width || sharedRenderCanvas.height !== height) {
    sharedRenderCanvas.width = width;
    sharedRenderCanvas.height = height;
  }
  const ctx = sharedRenderCanvas.getContext('2d')!;
  return { canvas: sharedRenderCanvas, ctx };
}

/**
 * Word-wrap paragraphs into lines matching content width.
 */
function wrapTextToLines(
  text: string,
  language: Language,
  contentWidth: number,
  mCtx: CanvasRenderingContext2D
): Array<{ text: string; isNewParagraph: boolean }> {
  const rawParagraphs = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const isCJK = ['zh', 'ja', 'ko'].includes(language.code);
  const layoutItems: Array<{ text: string; isNewParagraph: boolean }> = [];

  for (const para of rawParagraphs) {
    const lines: string[] = [];

    if (isCJK) {
      let currentLine = '';
      for (const char of para) {
        const testLine = currentLine + char;
        const testWidth = mCtx.measureText(testLine).width;
        if (testWidth > contentWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    } else {
      const words = para.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = mCtx.measureText(testLine).width;
        if (testWidth > contentWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }

    lines.forEach((line, idx) => {
      layoutItems.push({ text: line, isNewParagraph: idx === 0 });
    });
  }

  return layoutItems;
}

/**
 * Compiles all translated pages for a given language into a single jsPDF document.
 * Uses a single reused canvas to support documents up to 200+ pages with minimal memory footprint.
 */
export async function generateTranslatedPDF(
  pages: TranslatedPage[],
  language: Language
): Promise<{ blob: Blob; downloadUrl: string; fileSizeBytes: number }> {
  try {
    if (document.fonts) {
      await document.fonts.ready;
    }
  } catch {
    // Silent font readiness
  }

  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const totalPages = sortedPages.length;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const pageWidthPt = 595.28;
  const pageHeightPt = 841.89;

  const scale = 1.5; // ~150 DPI balanced for crystal-clear print and fast throughput
  const widthPx = Math.round(pageWidthPt * scale);
  const heightPx = Math.round(pageHeightPt * scale);

  const marginX = Math.round(44 * scale);
  const marginTop = Math.round(50 * scale);
  const marginBottom = Math.round(46 * scale);
  const contentWidth = widthPx - marginX * 2;

  const isRTL = Boolean(language.isRTL);
  const fontSize = Math.round(12 * scale);
  const lineHeight = Math.round(fontSize * 1.6);
  const paragraphGap = Math.round(8 * scale);

  const fontStyle = `normal ${fontSize}px ${language.fontFamily}`;
  const mCtx = getMeasureContext(fontStyle, isRTL);

  let isFirstPdfPage = true;

  for (const page of sortedPages) {
    const layoutItems = wrapTextToLines(page.translatedText || '', language, contentWidth, mCtx);
    let currentItemIdx = 0;

    do {
      const { canvas, ctx } = getRenderCanvas(widthPx, heightPx);

      // Clean white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, widthPx, heightPx);

      // Header
      ctx.font = `500 ${Math.round(8.5 * scale)}px "Inter", sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.fillText(`PDF Translator • ${language.name}`, marginX, Math.round(28 * scale));

      // Divider line
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1 * scale;
      ctx.beginPath();
      ctx.moveTo(marginX, Math.round(35 * scale));
      ctx.lineTo(widthPx - marginX, Math.round(35 * scale));
      ctx.stroke();

      // Body text
      ctx.font = fontStyle;
      ctx.fillStyle = '#1e293b';

      if (isRTL) {
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
      } else {
        ctx.direction = 'ltr';
        ctx.textAlign = 'left';
      }

      const drawX = isRTL ? widthPx - marginX : marginX;
      let currentY = marginTop + fontSize;

      while (currentItemIdx < layoutItems.length) {
        const item = layoutItems[currentItemIdx];
        const addedHeight = item.isNewParagraph && currentY > marginTop + fontSize ? paragraphGap + lineHeight : lineHeight;

        if (currentY + addedHeight > heightPx - marginBottom) {
          if (currentY > marginTop + fontSize) {
            break;
          }
        }

        if (item.isNewParagraph && currentY > marginTop + fontSize) {
          currentY += paragraphGap;
        }

        ctx.fillText(item.text, drawX, currentY);
        currentY += lineHeight;
        currentItemIdx++;
      }

      // Footer
      ctx.font = `normal ${Math.round(9 * scale)}px "Inter", sans-serif`;
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.direction = 'ltr';
      const footerLabel = totalPages > 1 ? `Page ${page.pageNumber} of ${totalPages}` : `Page ${page.pageNumber}`;
      ctx.fillText(footerLabel, widthPx / 2, heightPx - Math.round(18 * scale));

      // Append directly to PDF
      if (!isFirstPdfPage) {
        pdf.addPage([pageWidthPt, pageHeightPt], 'portrait');
      } else {
        isFirstPdfPage = false;
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.90);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'FAST');
    } while (currentItemIdx < layoutItems.length);
  }

  const blob = pdf.output('blob');
  const downloadUrl = URL.createObjectURL(blob);
  const fileSizeBytes = blob.size;

  return { blob, downloadUrl, fileSizeBytes };
}
