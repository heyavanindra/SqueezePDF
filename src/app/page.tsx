"use client";

import React, { useState, useRef, useEffect, useTransition } from "react";
import {
  Download,
  Sparkles,
  Zap,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  SlidersHorizontal,
  Layers,
  ArrowRight,
  Cpu,
  Image as ImageIcon,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  X,
  Timer,
} from "lucide-react";
import { FileUpload } from "@/components/ui/file-upload";
import { Progress } from "@/components/ui/progress";
import type { WorkerResponse, CompressMessageData, ProgressStage } from "../workers/pdf.worker";
import {
  inspectPdf,
  type DocumentInspection,
  type CompressionEngine,
} from "@/utils/compressionRouter";
import { compressWithCanvas } from "@/utils/canvasCompressor";

type WasmResolution = "screen" | "ebook" | "printer" | "prepress";
type CanvasQualityPreset = "canvas-extreme" | "canvas-balanced" | "canvas-clarity" | "canvas-print";

interface CompressionResult {
  filename: string;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  durationMs: number;
  engine: CompressionEngine;
  blobUrl?: string;
}

const WASM_PRESETS: {
  id: WasmResolution;
  name: string;
  badge: string;
  description: string;
}[] = [
  {
    id: "screen",
    name: "Smallest Size",
    badge: "Max Shrink",
    description: "Cuts file size the most. Ideal for strict email attachment and upload limits.",
  },
  {
    id: "ebook",
    name: "Balanced",
    badge: "Recommended",
    description: "Great balance of compact file size and sharp screen reading.",
  },
  {
    id: "printer",
    name: "High Clarity",
    badge: "Crisp Text",
    description: "Maintains high detail for presentations, charts, and printing.",
  },
  {
    id: "prepress",
    name: "Gentle",
    badge: "Best Quality",
    description: "Subtle size reduction while preserving full visual and color fidelity.",
  },
];

const CANVAS_PRESETS: {
  id: CanvasQualityPreset;
  name: string;
  badge: string;
  quality: number;
  scale: number;
  description: string;
}[] = [
  {
    id: "canvas-extreme",
    name: "Smallest Size",
    badge: "Max Shrink",
    quality: 0.5,
    scale: 1.0,
    description: "Maximum file reduction. Perfect for tight upload limits and forms.",
  },
  {
    id: "canvas-balanced",
    name: "Balanced",
    badge: "Recommended",
    quality: 0.65,
    scale: 1.25,
    description: "Clear text and images with significant file size savings.",
  },
  {
    id: "canvas-clarity",
    name: "High Clarity",
    badge: "Sharper",
    quality: 0.8,
    scale: 1.5,
    description: "Extra sharpness for receipts, invoices, and fine print.",
  },
  {
    id: "canvas-print",
    name: "Print Ready",
    badge: "Best Quality",
    quality: 0.9,
    scale: 2.0,
    description: "High-detail quality for printing or archiving important documents.",
  },
];

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function Home() {
  const [selectedEngine, setSelectedEngine] = useState<CompressionEngine>("wasm");
  const [isEngineManuallyChosen, setIsEngineManuallyChosen] = useState(false);
  const [selectedWasmPreset, setSelectedWasmPreset] = useState<WasmResolution>("ebook");
  const [selectedCanvasPreset, setSelectedCanvasPreset] = useState<CanvasQualityPreset>("canvas-balanced");
  
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<DocumentInspection | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  const [status, setStatus] = useState<"idle" | "compressing" | "completed" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [processingStage, setProcessingStage] = useState<ProgressStage | "idle">("idle");
  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [, startTransition] = useTransition();

  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<NodeJS.Timeout | number | null>(null);

  // Initialize and pre-warm the PDF compression Web Worker
  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/pdf.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    // Trigger WASM engine preloading
    worker.postMessage({ type: "init" } satisfies CompressMessageData);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Cleanup blob URL on unmount or update
  useEffect(() => {
    return () => {
      if (result?.blobUrl) {
        URL.revokeObjectURL(result.blobUrl);
      }
    };
  }, [result?.blobUrl]);

  // Handle global paste for seamless Emil-style DX
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData?.files) return;
      const pastedFile = Array.from(e.clipboardData.files).find(
        (f) => f.type === "application/pdf" || f.name.endsWith(".pdf")
      );
      if (pastedFile) {
        handleFileSelect(pastedFile);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleFileSelect = async (selectedFile: File) => {
    if (selectedFile.type !== "application/pdf" && !selectedFile.name.endsWith(".pdf")) {
      setErrorMessage("Please upload a valid PDF document.");
      setStatus("error");
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMessage("File exceeds 50 MB limit.");
      setStatus("error");
      return;
    }

    setFile(selectedFile);
    setStatus("idle");
    setErrorMessage("");
    setResult(null);
    setProgress(0);
    setElapsedSec(0);
    setCurrentPage(null);
    setTotalPages(null);
    setEtaSec(null);

    // Run non-blocking document inspection
    setIsInspecting(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const inspectResult = await inspectPdf(buffer, selectedFile.size);
      setInspection(inspectResult);
      setTotalPages(inspectResult.pageCount);

      // Only automatically switch engine if user has NOT explicitly chosen one
      if (!isEngineManuallyChosen) {
        setSelectedEngine(inspectResult.suggestedEngine);

        if (inspectResult.suggestedEngine === "canvas") {
          setSelectedCanvasPreset("canvas-balanced");
        } else {
          setSelectedWasmPreset("ebook");
        }
      }
    } catch (err) {
      console.warn("PDF inspection skipped:", err);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleCancelCompression = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;

      // Re-create worker instance for future compressions
      const worker = new Worker(
        new URL("../workers/pdf.worker.ts", import.meta.url),
        { type: "module" }
      );
      workerRef.current = worker;
      worker.postMessage({ type: "init" } satisfies CompressMessageData);
    }

    setStatus("idle");
    setStatusMessage("");
    setProgress(0);
    setCurrentPage(null);
    setTotalPages(inspection?.pageCount || null);
    setProcessingStage("idle");
    setEtaSec(null);
    setErrorMessage("");
  };

  const runCompression = async () => {
    if (!file) return;

    setStatus("compressing");
    setErrorMessage("");
    setProgress(4);
    setProcessingStage("init");
    setElapsedSec(0);
    setCurrentPage(null);
    setTotalPages(inspection?.pageCount || null);
    setEtaSec(null);

    const startTime = performance.now();

    if (result?.blobUrl) {
      URL.revokeObjectURL(result.blobUrl);
    }

    // Live elapsed timer that strictly tracks elapsed seconds without fake progress jumps
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    const timer = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      setElapsedSec(elapsed);
    }, 100);
    timerRef.current = timer;

    try {
      let compressedPdfBytes: Uint8Array;

      if (selectedEngine === "canvas") {
        // Run Canvas Engine Pipeline (In-Memory Canvas + jsPDF)
        setStatusMessage("Preparing document pages...");
        const fileBuffer = await file.arrayBuffer();
        const activeCanvasPreset = CANVAS_PRESETS.find((p) => p.id === selectedCanvasPreset) || CANVAS_PRESETS[1];

        compressedPdfBytes = await compressWithCanvas(fileBuffer, {
          quality: activeCanvasPreset.quality,
          scale: activeCanvasPreset.scale,
          onProgress: (cur, tot, pct) => {
            setCurrentPage(cur);
            setTotalPages(tot);
            setProcessingStage("page");
            setStatusMessage(`Optimizing page ${cur} of ${tot}...`);
            setProgress(Math.min(96, Math.max(5, Math.round(pct))));

            const elapsedMs = performance.now() - startTime;
            if (cur > 1 && tot > cur) {
              const msPerPage = elapsedMs / cur;
              const remaining = Math.round(((tot - cur) * msPerPage) / 1000);
              setEtaSec(remaining > 0 ? remaining : null);
            }
          },
        });
      } else {
        // Run Ghostscript Web Worker Pipeline with transparent progress
        setStatusMessage("Preparing document...");
        let worker = workerRef.current;
        if (!worker) {
          worker = new Worker(
            new URL("../workers/pdf.worker.ts", import.meta.url),
            { type: "module" }
          );
          workerRef.current = worker;
        }

        const fileBuffer = await file.arrayBuffer();

        compressedPdfBytes = await new Promise<Uint8Array>((resolve, reject) => {
          const handleMessage = (e: MessageEvent<WorkerResponse>) => {
            const data = e.data;
            if (data.type === "progress") {
              if (data.message) {
                setStatusMessage(data.message);
              }
              if (data.totalPages) {
                setTotalPages(data.totalPages);
              }

              if (data.stage === "init") {
                setProcessingStage("init");
                setProgress((prev) => Math.max(prev, 8));
              } else if (data.stage === "parsing") {
                setProcessingStage("parsing");
                setProgress((prev) => Math.max(prev, 14));
              } else if (data.stage === "page" && data.page && data.totalPages) {
                setProcessingStage("page");
                setCurrentPage(data.page);
                setTotalPages(data.totalPages);
                
                // Real mathematical mapping: 14% to 92% across all document pages
                const pageRatio = data.page / data.totalPages;
                const realProgress = Math.round(14 + pageRatio * 78);
                setProgress((prev) => Math.max(prev, Math.min(92, realProgress)));

                // Calculate realistic ETA based on actual per-page processing speed
                const elapsedMs = performance.now() - startTime;
                if (data.page >= 2 && data.totalPages > data.page) {
                  const msPerPage = elapsedMs / data.page;
                  const remainingPages = data.totalPages - data.page;
                  const remainingSec = Math.round((remainingPages * msPerPage) / 1000);
                  setEtaSec(remainingSec > 0 ? remainingSec : null);
                }
              } else if (data.stage === "finalizing") {
                setProcessingStage("finalizing");
                setProgress((prev) => Math.max(prev, 95));
                setEtaSec(null);
              }
            } else if (data.type === "complete") {
              cleanup();
              resolve(data.pdf);
            } else if (data.type === "error") {
              cleanup();
              reject(new Error(data.error));
            }
          };

          const handleError = (e: ErrorEvent) => {
            cleanup();
            reject(new Error(e.message || "PDF compression worker error"));
          };

          const cleanup = () => {
            worker?.removeEventListener("message", handleMessage);
            worker?.removeEventListener("error", handleError);
          };

          worker.addEventListener("message", handleMessage);
          worker.addEventListener("error", handleError);

          worker.postMessage(
            {
              type: "compress",
              pdf: fileBuffer,
              quality: selectedWasmPreset,
              totalPages: inspection?.pageCount,
            } satisfies CompressMessageData,
            [fileBuffer]
          );
        });
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setProgress(100);
      setProcessingStage("idle");
      setEtaSec(null);
      setStatusMessage("Finalizing your PDF...");

      const blob = new Blob([compressedPdfBytes as unknown as BlobPart], {
        type: "application/pdf",
      });
      const finalCompressedSize = blob.size;
      const blobUrl = URL.createObjectURL(blob);

      const elapsed = Math.round(performance.now() - startTime);
      const ratio = Math.max(0, Math.round((1 - finalCompressedSize / file.size) * 100));

      // Brief 220ms pause so the user sees the progress bar reach 100%
      setTimeout(() => {
        startTransition(() => {
          setResult({
            filename: file.name.replace(/\.pdf$/i, "-compressed.pdf"),
            originalSize: file.size,
            compressedSize: finalCompressedSize,
            ratio,
            durationMs: elapsed,
            engine: selectedEngine,
            blobUrl,
          });
          setStatus("completed");
        });
      }, 220);
    } catch (err: unknown) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setProcessingStage("idle");
      setEtaSec(null);
      const msg = err instanceof Error ? err.message : "Compression failed. Please try again.";
      setErrorMessage(msg);
      setStatus("error");
    }
  };

  const handleDownload = () => {
    if (!result?.blobUrl) {
      if (file) {
        const sampleUrl = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = sampleUrl;
        a.download = result?.filename || "compressed.pdf";
        a.click();
        URL.revokeObjectURL(sampleUrl);
      }
      return;
    }

    const a = document.createElement("a");
    a.href = result.blobUrl;
    a.download = result.filename;
    a.click();
  };

  const resetAll = () => {
    if (result?.blobUrl) {
      URL.revokeObjectURL(result.blobUrl);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setFile(null);
    setInspection(null);
    setIsEngineManuallyChosen(false);
    setStatus("idle");
    setResult(null);
    setErrorMessage("");
    setProgress(0);
    setElapsedSec(0);
    setCurrentPage(null);
    setTotalPages(null);
    setProcessingStage("idle");
    setEtaSec(null);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#09090b] text-[#f4f4f5] overflow-x-hidden font-sans">
      {/* Ambient background light beam & subtle grid */}
      <div className="pointer-events-none absolute inset-x-0 -top-40 flex justify-center overflow-hidden">
        <div className="h-[280px] sm:h-[480px] w-[500px] sm:w-[900px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(120,119,198,0.18),rgba(255,255,255,0))]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] sm:bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_15%,#000_70%,transparent_100%)]" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-b from-white/15 to-white/5 border border-white/10 shadow-[0_0_16px_rgba(255,255,255,0.06)]">
            <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-semibold tracking-tight text-white text-sm sm:text-base">SqueezePDF</span>
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] sm:text-[10px] font-mono text-zinc-400">
              v2.0
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-[10px] sm:text-[11px] tracking-wide">
              100% Private
            </span>
          </div>

          <a
            href="https://github.com/heyavanindra/realpdfcompressor"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors duration-150 p-1.5 touch-manipulation"
          >
            <span>GitHub</span>
          </a>
        </div>
      </header>

      {/* Hero Content */}
      <main className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-3.5 sm:px-6 pt-6 sm:pt-14 pb-12 sm:pb-24 text-center">
        {/* Release Pill */}
        <div className="mb-3.5 sm:mb-5 inline-flex max-w-[94vw] items-center gap-1.5 sm:gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] sm:text-xs text-zinc-300 backdrop-blur-md transition-colors hover:border-white/20 truncate">
          <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-400 shrink-0" />
          <span className="truncate">Private &amp; In-Browser</span>
          <span className="text-zinc-600 hidden xs:inline">•</span>
          <span className="text-zinc-400 hidden xs:inline">Documents never leave your device</span>
        </div>

        {/* Title */}
        <h1 className="max-w-2xl text-2xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white leading-tight">
          Shrink your PDF size <br className="hidden xs:inline" />
          <span className="bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            without losing quality.
          </span>
        </h1>

        <p className="mt-2.5 sm:mt-4 max-w-lg text-xs sm:text-sm md:text-base text-zinc-400 leading-relaxed px-1 sm:px-2">
          Easily reduce file size for email attachments, job applications, and upload limits while keeping text crisp and readable.
        </p>

        {/* Main Compression Console */}
        <div className="mt-6 sm:mt-9 w-full rounded-2xl border border-white/[0.08] bg-[#121215]/90 p-3.5 sm:p-6 md:p-7 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]">
          
          {/* Document Type Switcher */}
          <div className="mb-4 sm:mb-5">
            <div className="mb-2 flex items-center justify-between text-left">
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <FileCheck className="h-3.5 w-3.5 text-zinc-400" />
                Document Type
              </span>
              {isInspecting && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-indigo-400 animate-pulse">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Detecting document type...
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 rounded-xl bg-black/40 p-1.5 border border-white/[0.06]">
              {/* Option A: Digital Document (WASM) */}
              <button
                type="button"
                onClick={() => {
                  setSelectedEngine("wasm");
                  setIsEngineManuallyChosen(true);
                }}
                className={`group relative flex flex-col items-start rounded-lg p-2 sm:p-2.5 text-left pressable cursor-pointer touch-manipulation min-h-[54px] sm:min-h-[62px] justify-between transition-all duration-150 ${
                  selectedEngine === "wasm"
                    ? "bg-white/[0.1] border border-white/20 shadow-[0_0_16px_rgba(255,255,255,0.05)]"
                    : "bg-transparent border border-transparent hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileCheck className={`h-3.5 w-3.5 shrink-0 ${selectedEngine === "wasm" ? "text-indigo-400" : "text-zinc-500"}`} />
                    <span className={`text-xs font-medium truncate ${selectedEngine === "wasm" ? "text-white" : "text-zinc-400"}`}>
                      Digital Document
                    </span>
                  </div>
                  <span className="rounded bg-white/[0.06] px-1 py-0.5 text-[9px] font-mono text-zinc-400 shrink-0">
                    Best for Text
                  </span>
                </div>
                <span className="mt-1 text-[10px] text-zinc-500 leading-tight line-clamp-2 sm:line-clamp-none">
                  Resumes, contracts &amp; reports with crisp text
                </span>
              </button>

              {/* Option B: Scanned & Photos (Canvas) */}
              <button
                type="button"
                onClick={() => {
                  setSelectedEngine("canvas");
                  setIsEngineManuallyChosen(true);
                }}
                className={`group relative flex flex-col items-start rounded-lg p-2 sm:p-2.5 text-left pressable cursor-pointer touch-manipulation min-h-[54px] sm:min-h-[62px] justify-between transition-all duration-150 ${
                  selectedEngine === "canvas"
                    ? "bg-white/[0.1] border border-white/20 shadow-[0_0_16px_rgba(255,255,255,0.05)]"
                    : "bg-transparent border border-transparent hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ImageIcon className={`h-3.5 w-3.5 shrink-0 ${selectedEngine === "canvas" ? "text-emerald-400" : "text-zinc-500"}`} />
                    <span className={`text-xs font-medium truncate ${selectedEngine === "canvas" ? "text-white" : "text-zinc-400"}`}>
                      Scanned &amp; Photos
                    </span>
                  </div>
                  <span className="rounded bg-white/[0.06] px-1 py-0.5 text-[9px] font-mono text-zinc-400 shrink-0">
                    Max Shrink
                  </span>
                </div>
                <span className="mt-1 text-[10px] text-zinc-500 leading-tight line-clamp-2 sm:line-clamp-none">
                  Paper scans, receipts &amp; heavy photo pages
                </span>
              </button>
            </div>

            {/* Smart Inspection Banner */}
            {inspection && (
              <div className="mt-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 sm:px-3 sm:py-2 text-left">
                {inspection.isIOSLargeFile ? (
                  <div className="flex items-center gap-2 text-amber-400 text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Large document on mobile. Automatically adjusted for smooth performance.</span>
                  </div>
                ) : inspection.isScanned ? (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>
                      Detected scanned document ({inspection.pageCount} {inspection.pageCount === 1 ? "page" : "pages"}). Switched to Scanned &amp; Photos for best reduction.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-indigo-300 text-xs">
                    <FileCheck className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                    <span>
                      Detected document with text ({inspection.pageCount} {inspection.pageCount === 1 ? "page" : "pages"}). Optimized for Digital Document to keep text razor-sharp.
                    </span>
                  </div>
                )}

                {/* Quick switch button */}
                {selectedEngine !== inspection.suggestedEngine && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEngine(inspection.suggestedEngine);
                      setIsEngineManuallyChosen(true);
                    }}
                    className="shrink-0 text-[11px] font-mono text-indigo-400 hover:text-indigo-300 underline cursor-pointer p-1 touch-manipulation self-end sm:self-auto"
                  >
                    Switch to {inspection.suggestedEngine === "wasm" ? "Digital Document" : "Scanned & Photos"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Preset Quality Selector */}
          <div className="mb-4 sm:mb-5">
            <div className="mb-2 flex items-center justify-between text-left">
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                Compression Level
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono text-zinc-400">
                {selectedEngine === "wasm"
                  ? WASM_PRESETS.find((p) => p.id === selectedWasmPreset)?.badge
                  : CANVAS_PRESETS.find((p) => p.id === selectedCanvasPreset)?.badge}
              </span>
            </div>

            {/* Presets Grid: 2 columns on mobile, 4 on desktop */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 sm:grid-cols-4">
              {selectedEngine === "wasm"
                ? WASM_PRESETS.map((preset) => {
                    const isSelected = selectedWasmPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedWasmPreset(preset.id)}
                        className={`group relative flex flex-col items-start rounded-xl p-2.5 text-left pressable cursor-pointer min-h-[50px] sm:min-h-[56px] select-none touch-manipulation justify-between ${
                          isSelected
                            ? "bg-white/[0.09] border border-white/25 shadow-[0_0_20px_rgba(255,255,255,0.06)]"
                            : "bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/12"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span
                            className={`text-xs font-medium transition-colors duration-140 ${
                              isSelected ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                            }`}
                          >
                            {preset.name}
                          </span>
                          {isSelected && (
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
                          )}
                        </div>
                        <span className="mt-1 text-[10px] font-mono text-zinc-500 truncate w-full">
                          {preset.badge}
                        </span>
                      </button>
                    );
                  })
                : CANVAS_PRESETS.map((preset) => {
                    const isSelected = selectedCanvasPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedCanvasPreset(preset.id)}
                        className={`group relative flex flex-col items-start rounded-xl p-2.5 text-left pressable cursor-pointer min-h-[50px] sm:min-h-[56px] select-none touch-manipulation justify-between ${
                          isSelected
                            ? "bg-white/[0.09] border border-white/25 shadow-[0_0_20px_rgba(255,255,255,0.06)]"
                            : "bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/12"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span
                            className={`text-xs font-medium transition-colors duration-140 ${
                              isSelected ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                            }`}
                          >
                            {preset.name}
                          </span>
                          {isSelected && (
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
                          )}
                        </div>
                        <span className="mt-1 text-[10px] font-mono text-zinc-500 truncate w-full">
                          {preset.badge}
                        </span>
                      </button>
                    );
                  })}
            </div>
          </div>

          {/* Upload / Processing / Completed Stage */}
          {status === "completed" && result ? (
            /* Completed Result Card */
            <div className="animate-pop-in flex flex-col items-center rounded-xl border border-white/[0.08] bg-black/40 p-4 sm:p-7">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-[0_0_24px_rgba(16,185,129,0.2)]">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>

              <div className="mt-2.5 flex items-center gap-2 flex-wrap justify-center">
                <h3 className="text-sm sm:text-base font-medium text-white">Your PDF is ready!</h3>
                <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                  {result.engine === "wasm" ? "Digital Document" : "Scanned Document"}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-zinc-400 truncate max-w-[220px] sm:max-w-md">{file?.name}</p>

              {/* Stats Comparison Grid */}
              <div className="mt-3.5 sm:mt-5 grid w-full grid-cols-3 gap-1 sm:gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 sm:p-3 text-center">
                <div className="animate-pop-in flex flex-col py-1">
                  <span className="text-[9px] sm:text-[10px] font-mono uppercase text-zinc-500">Original Size</span>
                  <span className="mt-0.5 font-mono text-xs sm:text-sm text-zinc-300">
                    {formatBytes(result.originalSize)}
                  </span>
                </div>

                <div className="animate-pop-in stagger-1 flex flex-col border-x border-white/[0.06] py-1">
                  <span className="text-[9px] sm:text-[10px] font-mono uppercase text-zinc-500">New Size</span>
                  <span className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-emerald-400">
                    {formatBytes(result.compressedSize)}
                  </span>
                </div>

                {result.compressedSize <= result.originalSize ? (
                  <div className="animate-pop-in stagger-2 flex flex-col rounded-lg bg-indigo-500/[0.08] border border-indigo-500/20 py-1">
                    <span className="text-[9px] sm:text-[10px] font-mono uppercase text-indigo-400/90 font-medium">Space Saved</span>
                    <span className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-indigo-300">
                      -{result.ratio}%
                    </span>
                  </div>
                ) : (
                  <div className="animate-pop-in stagger-2 flex flex-col rounded-lg bg-amber-500/[0.08] border border-amber-500/20 py-1">
                    <span className="text-[9px] sm:text-[10px] font-mono uppercase text-amber-400/90 font-medium">Size Change</span>
                    <span className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-amber-300">
                      +{Math.round(((result.compressedSize - result.originalSize) / result.originalSize) * 100)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Explanatory Advisory if Canvas rasterizer increased a vector text document */}
              {result.compressedSize > result.originalSize && result.engine === "canvas" && (
                <div className="mt-3.5 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] p-3 text-left text-xs text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div className="flex-1 leading-relaxed text-[11px] sm:text-xs">
                    <span className="font-semibold text-amber-300">Why didn't the file get smaller?</span> This document is already made of clean digital text. Converting pages into images made the file larger.
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEngine("wasm");
                          setIsEngineManuallyChosen(true);
                          resetAll();
                        }}
                        className="font-medium text-white underline hover:text-amber-100 cursor-pointer"
                      >
                        Switch to Digital Document mode &amp; re-compress &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons: Stacked on mobile with 48px touch targets */}
              <div className="mt-4 sm:mt-5 flex w-full flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="group relative flex w-full sm:flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-medium text-black shadow-[0_0_28px_rgba(255,255,255,0.18)] pressable hover:bg-zinc-100 touch-manipulation min-h-[48px]"
                >
                  <Download className="h-4 w-4 transition-transform duration-150 ease-out group-hover:-translate-y-0.5" />
                  Download Compressed PDF
                </button>

                <button
                  type="button"
                  onClick={resetAll}
                  className="group flex w-full sm:flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-medium text-zinc-300 pressable hover:bg-white/[0.08] hover:text-white hover:border-white/20 touch-manipulation min-h-[48px]"
                >
                  <RotateCcw className="h-4 w-4 text-zinc-400 transition-transform duration-200 ease-out group-hover:-rotate-45" />
                  Compress Another File
                </button>
              </div>
            </div>
          ) : status === "compressing" ? (
            /* Transparent Processing State with Real Stage & Page Telemetry */
            <div className="animate-pop-in flex flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-black/40 py-6 sm:py-8 px-3.5 sm:px-6 w-full">
              <div className="relative flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-fast-spin" />
                <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-400 animate-pulse" />
              </div>

              {/* Header with Engine & Real Progress Percentage */}
              <div className="mt-4 flex items-center justify-between w-full max-w-sm px-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-medium text-zinc-200">
                    {selectedEngine === "wasm" ? "Digital Document" : "Scanned Document"}
                  </span>
                  {processingStage === "page" && currentPage && totalPages && (
                    <span className="rounded bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 text-[9px] sm:text-[10px] font-mono text-indigo-300">
                      p.{currentPage}/{totalPages}
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs sm:text-sm font-semibold text-emerald-400 tabular-nums">
                  {Math.round(progress)}%
                </span>
              </div>

              {/* Progress Bar with Active Shimmer */}
              <div className="mt-2 w-full max-w-sm">
                <Progress value={progress} />
              </div>

              {/* Live page / status message */}
              <div className="mt-2.5 flex items-center justify-between w-full max-w-sm text-[10px] sm:text-[11px] font-mono text-zinc-400">
                <span className="truncate max-w-[200px] sm:max-w-[250px] text-left flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                  <span className="truncate">{statusMessage || "Optimizing document..."}</span>
                </span>
                
                <div className="flex items-center gap-1.5 shrink-0 text-zinc-500 pl-1">
                  {etaSec !== null && (
                    <span className="text-indigo-400/90 font-mono text-[10px]">
                      ~{etaSec}s left
                    </span>
                  )}
                  <span>{elapsedSec.toFixed(1)}s</span>
                </div>
              </div>

              {/* Page count pill if multi-page */}
              {currentPage && totalPages && totalPages > 1 && (
                <div className="mt-3.5 flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-mono text-zinc-300 shadow-sm">
                  <span className="text-zinc-500">Progress:</span>
                  <span className="text-white font-medium">Page {currentPage} of {totalPages}</span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-emerald-400 font-semibold">{Math.round((currentPage / totalPages) * 100)}% done</span>
                </div>
              )}

              {/* Cancel Escape Hatch */}
              <button
                type="button"
                onClick={handleCancelCompression}
                className="mt-4 flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors p-1.5 cursor-pointer touch-manipulation active:scale-95"
              >
                <X className="h-3 w-3" />
                <span>Cancel</span>
              </button>
            </div>
          ) : (
            /* Upload Dropzone State powered by Aceternity FileUpload */
            <FileUpload
              file={file}
              onChange={(files) => {
                if (files && files.length > 0) {
                  handleFileSelect(files[0]);
                }
              }}
              onClear={resetAll}
            />
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="animate-pop-in mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Compress Trigger Button */}
          {status !== "completed" && status !== "compressing" && (
            <div className="mt-3.5 sm:mt-5 flex justify-end">
              <button
                type="button"
                disabled={!file}
                onClick={runCompression}
                className={`group relative flex w-full items-center justify-center gap-2 rounded-xl py-3 sm:py-3.5 px-4 sm:px-5 text-xs sm:text-sm font-medium pressable touch-manipulation min-h-[48px] ${
                  file
                    ? "bg-white text-black shadow-[0_0_28px_rgba(255,255,255,0.22)] hover:bg-zinc-100 cursor-pointer"
                    : "bg-white/[0.04] text-zinc-500 border border-white/[0.05] cursor-not-allowed"
                }`}
              >
                <span>Compress PDF</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-1" />
              </button>
            </div>
          )}
        </div>

        {/* Feature Cards Grid: 1 column on mobile, 3 on desktop */}
        <div className="mt-8 sm:mt-12 grid w-full grid-cols-1 gap-2.5 sm:gap-4 text-left sm:grid-cols-3">
          <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 sm:p-5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.035] hover:-translate-y-0.5">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 transition-transform duration-200 group-hover:scale-110 group-hover:text-white">
              <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <h4 className="mt-2.5 text-xs sm:text-sm font-medium text-white">100% Private &amp; Secure</h4>
            <p className="mt-1 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
              Your files never leave your computer. All processing happens privately inside your browser with zero server uploads.
            </p>
          </div>

          <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 sm:p-5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.035] hover:-translate-y-0.5">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 transition-transform duration-200 group-hover:scale-110 group-hover:text-white">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <h4 className="mt-2.5 text-xs sm:text-sm font-medium text-white">Crisp, Readable Text</h4>
            <p className="mt-1 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
              Resumes, reports, and contracts stay sharp and easy to read, preserving selectable fonts and clean layout.
            </p>
          </div>

          <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 sm:p-5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.035] hover:-translate-y-0.5">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 transition-transform duration-200 group-hover:scale-110 group-hover:text-white">
              <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <h4 className="mt-2.5 text-xs sm:text-sm font-medium text-white">Fits Any Upload Limit</h4>
            <p className="mt-1 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
              Easily meet strict size requirements for job applications, university portals, and email attachments in seconds.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
