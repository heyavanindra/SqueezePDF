import * as pdfjsLib from "pdfjs-dist";
import { jsPDF } from "jspdf";
import { isIOSDevice } from "./compressionRouter";

export interface CanvasCompressOptions {
  quality?: number; // 0.1 to 1.0 (recommended: 0.65)
  scale?: number;   // DPI scale factor (recommended: 1.25)
  onProgress?: (current: number, total: number, percent: number) => void;
}

// Ensure PDF.js worker is properly configured
function ensurePdfJsWorker() {
  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
}

/**
 * Compresses a PDF by sequentially rendering its pages to an HTML5 canvas,
 * downsampling raster layers to JPEG, and reconstructing a clean PDF via jsPDF.
 * 
 * Perfect for scanned invoices, receipts, and memory-constrained mobile devices.
 */
export async function compressWithCanvas(
  fileBuffer: ArrayBuffer,
  options: CanvasCompressOptions = {}
): Promise<Uint8Array> {
  ensurePdfJsWorker();

  const isIOS = isIOSDevice();
  let { quality = 0.65, scale = 1.25, onProgress } = options;

  // On iOS Safari, rendering large documents at high DPI scales (e.g. 1.25x or 1.5x)
  // creates enormous canvas backing stores that exceed WebKit's Jetsam limit (~350MB).
  // Adaptively clamp scale to 1.0 for large documents on iOS to guarantee memory safety.
  if (isIOS && fileBuffer.byteLength > 15 * 1024 * 1024) {
    scale = Math.min(scale, 1.0);
  }

  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

  try {
    const uint8View = new Uint8Array(fileBuffer);
    loadingTask = pdfjsLib.getDocument({ data: uint8View });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    let outPdf: jsPDF | null = null;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const percent = Math.round(((pageNum - 0.5) / totalPages) * 90);
      onProgress?.(pageNum, totalPages, percent);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: false });
      if (!ctx) throw new Error("Could not initialize 2D canvas context.");

      // Fill white background before rendering to prevent black backgrounds on transparent PDFs
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render PDF page into canvas
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      // Convert to JPEG data URL at target quality
      const imgData = canvas.toDataURL("image/jpeg", quality);
      const orientation = viewport.width > viewport.height ? "landscape" : "portrait";

      // Initialize or append page in jsPDF
      if (pageNum === 1) {
        outPdf = new jsPDF({
          orientation,
          unit: "pt",
          format: [viewport.width, viewport.height],
          compress: true,
        });
      } else {
        outPdf!.addPage([viewport.width, viewport.height], orientation);
      }

      outPdf!.addImage(imgData, "JPEG", 0, 0, viewport.width, viewport.height, undefined, "FAST");

      // CRITICAL FOR IOS MEMORY LEAK PREVENTION:
      // 1. Release the internal glyph, font, and bitmap cache of this page in PDF.js
      page.cleanup();

      // 2. Explicitly zero-out canvas dimensions to release backing store immediately
      canvas.width = 0;
      canvas.height = 0;

      // 3. Yield to the event loop so the V8 / WebKit garbage collector can reclaim memory
      const pauseDuration = isIOS ? 25 : 10;
      await new Promise((resolve) => setTimeout(resolve, pauseDuration));
    }

    if (!outPdf) {
      throw new Error("Canvas compression failed: no pages rendered.");
    }

    onProgress?.(totalPages, totalPages, 95);

    const arrayBuffer = outPdf.output("arraybuffer");
    return new Uint8Array(arrayBuffer);
  } finally {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch {
        // Safe ignore
      }
    }
  }
}
