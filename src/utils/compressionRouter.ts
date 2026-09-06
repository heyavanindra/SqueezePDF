import * as pdfjsLib from "pdfjs-dist";

export type CompressionEngine = "wasm" | "canvas";

export interface DocumentInspection {
  suggestedEngine: CompressionEngine;
  hasSelectableText: boolean;
  pageCount: number;
  characterCount: number;
  isScanned: boolean;
  isIOSLargeFile: boolean;
}

// Ensure PDF.js worker is properly configured for client-side execution
function ensurePdfJsWorker() {
  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
}

/**
 * Detects if the current user agent is iOS (iPhone/iPad) or iPadOS
 */
export function isIOSDevice(): boolean {
  if (typeof window === "undefined" || !navigator) return false;
  const ua = navigator.userAgent || "";
  const isAppleTouch =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isAppleTouch;
}

/**
 * Inspects character density across up to the first 3 pages of a PDF
 * to determine whether the document is vector text or a scanned raster image.
 */
export async function inspectPdf(
  fileBuffer: ArrayBuffer,
  fileSizeBytes: number
): Promise<DocumentInspection> {
  ensurePdfJsWorker();

  const isIOS = isIOSDevice();
  const isLargeFile = fileSizeBytes > 15 * 1024 * 1024;
  const isIOSLargeFile = isIOS && isLargeFile;

  try {
    // Clone buffer because PDF.js may transfer it
    const bufferCopy = fileBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data: bufferCopy });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;

    let totalChars = 0;
    const sampleLimit = Math.min(pageCount, 3);

    for (let i = 1; i <= sampleLimit; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageChars = content.items.reduce((acc, item) => {
        return acc + ("str" in item && typeof item.str === "string" ? item.str.length : 0);
      }, 0);
      totalChars += pageChars;
    }

    const hasSelectableText = totalChars >= 50;
    const isScanned = !hasSelectableText;

    // Recommendation logic:
    // 1. If on iOS and file is > 15MB, recommend canvas to avoid memory crash
    // 2. If scanned (chars < 50), canvas provides far superior compression
    // 3. Otherwise, WASM preserves vector text and typography
    let suggestedEngine: CompressionEngine = "wasm";
    if (isIOSLargeFile || isScanned) {
      suggestedEngine = "canvas";
    }

    return {
      suggestedEngine,
      hasSelectableText,
      pageCount,
      characterCount: totalChars,
      isScanned,
      isIOSLargeFile,
    };
  } catch (err) {
    console.warn("[PDF Inspection Error] Falling back to default WASM engine:", err);
    return {
      suggestedEngine: isIOSLargeFile ? "canvas" : "wasm",
      hasSelectableText: true,
      pageCount: 1,
      characterCount: 100,
      isScanned: false,
      isIOSLargeFile,
    };
  }
}
