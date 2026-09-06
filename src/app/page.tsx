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
  Lock,
  ChevronDown,
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
    name: "Maximum Reduction",
    badge: "Smallest file",
    description: "Lowest file size. Best for strict email limits and upload portals.",
  },
  {
    id: "ebook",
    name: "Balanced",
    badge: "Recommended ●",
    description: "Optimal balance of compact file size and sharp screen reading.",
  },
  {
    id: "printer",
    name: "High Quality",
    badge: "Better detail",
    description: "High resolution for reports, presentations, and typography.",
  },
  {
    id: "prepress",
    name: "Crisp Print",
    badge: "Maximum detail",
    description: "Full visual fidelity and high detail for printing and archiving.",
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
    name: "Maximum Reduction",
    badge: "Smallest file",
    quality: 0.5,
    scale: 1.0,
    description: "Maximum file reduction for strict upload portals and forms.",
  },
  {
    id: "canvas-balanced",
    name: "Balanced",
    badge: "Recommended ●",
    quality: 0.65,
    scale: 1.25,
    description: "Clear text and images with significant file size savings.",
  },
  {
    id: "canvas-clarity",
    name: "High Quality",
    badge: "Better detail",
    quality: 0.8,
    scale: 1.5,
    description: "Extra sharpness for receipts, diagrams, and fine print.",
  },
  {
    id: "canvas-print",
    name: "Crisp Print",
    badge: "Maximum detail",
    quality: 0.9,
    scale: 2.0,
    description: "High-detail quality for printing or archiving documents.",
  },
];

type PresetLevel = "max" | "balanced" | "high" | "print";

interface PresetTier {
  id: PresetLevel;
  name: string;
  badge: string;
  wasmId: WasmResolution;
  canvasId: CanvasQualityPreset;
}

const PRESET_TIERS: PresetTier[] = [
  {
    id: "max",
    name: "Maximum Reduction",
    badge: "Smallest file",
    wasmId: "screen",
    canvasId: "canvas-extreme",
  },
  {
    id: "balanced",
    name: "Balanced",
    badge: "Recommended ●",
    wasmId: "ebook",
    canvasId: "canvas-balanced",
  },
  {
    id: "high",
    name: "High Quality",
    badge: "Better detail",
    wasmId: "printer",
    canvasId: "canvas-clarity",
  },
  {
    id: "print",
    name: "Crisp Print",
    badge: "Maximum detail",
    wasmId: "prepress",
    canvasId: "canvas-print",
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
  const [selectedPreset, setSelectedPreset] = useState<PresetLevel>("balanced");
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
        setSelectedPreset("balanced");
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
    setSelectedEngine("wasm");
    setSelectedPreset("balanced");
    setSelectedWasmPreset("ebook");
    setSelectedCanvasPreset("canvas-balanced");
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
        <div className="h-[280px] sm:h-[480px] w-[500px] sm:w-[900px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.08),rgba(255,255,255,0.03),transparent)]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] sm:bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_15%,#000_70%,transparent_100%)]" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-gradient-to-b from-white/15 to-white/5 border border-white/10 shadow-[0_0_16px_rgba(255,255,255,0.06)]">
            <Layers className="h-3.5 w-3.5 text-white" />
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
              Ready
            </span>
          </div>

          <a
            href="https://github.com/heyavanindra/realpdfcompressor"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors duration-150 p-1 touch-manipulation"
          >
            <span>GitHub</span>
          </a>
        </div>
      </header>

      {/* Hero Content */}
      <main className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-3.5 sm:px-6 pt-5 sm:pt-9 pb-12 sm:pb-20 text-center">
        {/* Title */}
        <h1 className="max-w-xl text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white leading-tight">
          Compress PDF files online.
        </h1>

        <p className="mt-2.5 max-w-lg text-sm sm:text-base text-zinc-300">
          Reduce PDF size quickly — with full control over quality.
        </p>

        <p className="mt-1.5 text-xs sm:text-sm text-zinc-400">
          Free · No signup · 100% client-side
        </p>

        {/* Main Compression Console */}
        <div className="mt-5 sm:mt-7 w-full rounded-2xl border border-white/[0.08] bg-[#121215]/90 p-3.5 sm:p-5 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]">
          {status === "completed" && result ? (
            /* Completed Result Card - Savings as Visual Hero */
            <div className="animate-pop-in flex flex-col items-center rounded-xl border border-white/[0.08] bg-black/40 p-5 sm:p-7 text-center">
              {/* Success Confirmation */}
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs sm:text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" />
                <span>Compression complete</span>
              </div>

              {/* Savings Visual Hero */}
              {result.compressedSize <= result.originalSize ? (
                <div className="mt-3.5 flex flex-col items-center">
                  <div className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                    {result.ratio}% smaller
                  </div>
                  <div className="mt-2 flex items-center gap-2 font-mono text-xs sm:text-sm text-zinc-400">
                    <span>{formatBytes(result.originalSize)}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="font-semibold text-emerald-400">{formatBytes(result.compressedSize)}</span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-emerald-400/90">
                    You saved {formatBytes(result.originalSize - result.compressedSize)}
                  </div>
                </div>
              ) : (
                <div className="mt-3.5 flex flex-col items-center">
                  <div className="text-3xl sm:text-4xl font-bold tracking-tight text-amber-300">
                    +{Math.round(((result.compressedSize - result.originalSize) / result.originalSize) * 100)}%
                  </div>
                  <div className="mt-2 flex items-center gap-2 font-mono text-xs sm:text-sm text-zinc-400">
                    <span>{formatBytes(result.originalSize)}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="font-semibold text-amber-300">{formatBytes(result.compressedSize)}</span>
                  </div>
                  <div className="mt-1 text-xs text-amber-400/90">
                    Document was already optimized
                  </div>
                </div>
              )}

              {/* Stats Comparison Grid */}
              <div className="mt-4 sm:mt-5 grid w-full grid-cols-3 gap-1 sm:gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 sm:p-3 text-center">
                <div className="flex flex-col py-1">
                  <span className="text-[9px] sm:text-[10px] font-mono uppercase text-zinc-500">Original</span>
                  <span className="mt-0.5 font-mono text-xs sm:text-sm text-zinc-300">
                    {formatBytes(result.originalSize)}
                  </span>
                </div>

                <div className="flex flex-col border-x border-white/[0.06] py-1">
                  <span className="text-[9px] sm:text-[10px] font-mono uppercase text-zinc-500">Compressed</span>
                  <span className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-emerald-400">
                    {formatBytes(result.compressedSize)}
                  </span>
                </div>

                <div className="flex flex-col py-1">
                  <span className="text-[9px] sm:text-[10px] font-mono uppercase text-zinc-500">Saved</span>
                  <span className={`mt-0.5 font-mono text-xs sm:text-sm font-semibold ${
                    result.compressedSize <= result.originalSize ? "text-emerald-400" : "text-amber-300"
                  }`}>
                    {result.compressedSize <= result.originalSize ? `-${result.ratio}%` : "0%"}
                  </span>
                </div>
              </div>

              {/* Explanatory Advisory if Canvas rasterizer increased a vector text document */}
              {result.compressedSize > result.originalSize && result.engine === "canvas" && (
                <div className="mt-3.5 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-left text-xs text-amber-200 w-full">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div className="flex-1 leading-relaxed text-[11px] sm:text-xs">
                    <span className="font-semibold text-amber-300">Why didn't the file get smaller?</span> This document contains clean digital text. Converting pages into images increased the size.
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
                        Re-compress using Ghostscript WASM &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons: Primary Download + Secondary Compress Another */}
              <div className="mt-5 flex w-full flex-col sm:flex-row gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="group relative flex w-full sm:flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-medium text-black shadow-[0_0_28px_rgba(255,255,255,0.18)] pressable hover:bg-zinc-100 touch-manipulation min-h-[48px] cursor-pointer"
                >
                  <Download className="h-4 w-4 transition-transform duration-150 ease-out group-hover:-translate-y-0.5" />
                  Download Compressed PDF
                </button>

                <button
                  type="button"
                  onClick={resetAll}
                  className="group flex w-full sm:flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm font-medium text-zinc-300 pressable hover:bg-white/[0.08] hover:text-white hover:border-white/20 touch-manipulation min-h-[48px] cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4 text-zinc-400 transition-transform duration-200 ease-out group-hover:-rotate-45" />
                  Compress Another
                </button>
              </div>
            </div>
          ) : status === "compressing" ? (
            /* Transparent Processing State with Refined Industrial Precision */
            <div className="animate-pop-in flex flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-black/40 py-6 sm:py-8 px-4 sm:px-6 w-full text-center">
              <div className="relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-white/10 border-t-emerald-400 animate-fast-spin" />
                <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              </div>

              <h3 className="mt-3.5 text-base sm:text-lg font-medium text-white">
                Compressing...
              </h3>

              {processingStage === "page" && currentPage && totalPages ? (
                <p className="mt-1 text-xs sm:text-sm font-mono text-zinc-300">
                  Processing page {currentPage} of {totalPages}
                </p>
              ) : (
                <p className="mt-1 text-xs sm:text-sm text-zinc-400">
                  {statusMessage || "Optimizing document..."}
                </p>
              )}

              {/* Progress Bar with Precision Shimmer */}
              <div className="mt-3.5 w-full max-w-sm">
                <Progress value={progress} />
              </div>

              {/* Percentage & Elapsed */}
              <div className="mt-2.5 flex items-center justify-between w-full max-w-sm text-[11px] font-mono text-zinc-400 px-0.5">
                <span className="text-emerald-400 font-semibold tabular-nums">{Math.round(progress)}%</span>
                <div className="flex items-center gap-2 text-zinc-500">
                  {etaSec !== null && <span className="text-zinc-400">~{etaSec}s left</span>}
                  <span>{elapsedSec.toFixed(1)}s</span>
                </div>
              </div>

              <p className="mt-3 text-xs text-zinc-500">
                Please keep this tab open.
              </p>

              {/* Cancel Escape Hatch */}
              <button
                type="button"
                onClick={handleCancelCompression}
                className="mt-3.5 flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors p-1.5 cursor-pointer touch-manipulation active:scale-95"
              >
                <X className="h-3 w-3" />
                <span>Cancel</span>
              </button>
            </div>
          ) : (
            /* Upload / Configuration Flow */
            <div className="flex flex-col">
              {/* The File Dropzone */}
              <FileUpload
                file={file}
                onChange={(files) => {
                  if (files && files.length > 0) {
                    handleFileSelect(files[0]);
                  }
                }}
                onClear={resetAll}
              />

              {/* Above the fold reassurance when no file is uploaded */}
              {!file && (
                <div className="mt-3.5 flex items-center justify-center gap-1.5 text-xs text-zinc-400">
                  <Lock className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Files never leave your device</span>
                </div>
              )}

              {/* Compression controls revealed once file is selected */}
              {file && (
                <div className="mt-4 flex flex-col text-left animate-pop-in">
                  {/* Smart Inspection Banner */}
                  {isInspecting ? (
                    <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-xs text-zinc-300 font-mono">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Detecting document structure...</span>
                    </div>
                  ) : inspection ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 sm:px-3 sm:py-2 text-xs">
                      <div className="flex items-center gap-2 text-zinc-300">
                        {inspection.isScanned ? (
                          <>
                            <ImageIcon className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span>
                              Detected scanned pages ({inspection.pageCount} {inspection.pageCount === 1 ? "page" : "pages"}) • Optimized for image reduction
                            </span>
                          </>
                        ) : (
                          <>
                            <FileCheck className="h-3.5 w-3.5 text-emerald-400/80 shrink-0" />
                            <span>
                              Detected document with text ({inspection.pageCount} {inspection.pageCount === 1 ? "page" : "pages"}) • Optimized for razor-sharp text
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Preset Quality Selector */}
                  <div className="mt-3.5">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="text-xs font-medium text-zinc-200">Compression</span>
                        <span className="text-[11px] font-mono text-emerald-400">
                          {PRESET_TIERS.find((p) => p.id === selectedPreset)?.name} · {PRESET_TIERS.find((p) => p.id === selectedPreset)?.badge}
                        </span>
                      </div>
                      {!isEngineManuallyChosen && (
                        <span className="text-[10px] text-zinc-400 hidden sm:inline font-mono">
                          Automatically optimized for this document
                        </span>
                      )}
                    </div>

                    {/* Presets Grid: 2 columns on mobile, 4 on desktop */}
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2 sm:grid-cols-4">
                      {PRESET_TIERS.map((tier) => {
                        const isSelected = selectedPreset === tier.id;
                        return (
                          <button
                            key={tier.id}
                            type="button"
                            onClick={() => {
                              setSelectedPreset(tier.id);
                              setSelectedWasmPreset(tier.wasmId);
                              setSelectedCanvasPreset(tier.canvasId);
                            }}
                            className={`group relative flex flex-col items-start rounded-xl p-2.5 sm:p-3 text-left pressable cursor-pointer min-h-[56px] select-none touch-manipulation justify-between ${
                              isSelected
                                ? "bg-white/[0.08] border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(0,0,0,0.3)]"
                                : "bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/10"
                            }`}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span
                                className={`text-xs font-medium transition-colors duration-140 ${
                                  isSelected ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                                }`}
                              >
                                {tier.name}
                              </span>
                              {isSelected && (
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
                              )}
                            </div>
                            <span className="mt-1 text-[10px] font-mono text-zinc-500 truncate w-full">
                              {tier.badge}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Advanced Options Collapsible */}
                  <details className="mt-3.5 group/adv border-t border-white/[0.06] pt-3">
                    <summary className="flex items-center justify-between text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 select-none list-none">
                      <span className="flex items-center gap-1.5 font-medium">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500" />
                        Advanced options
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-zinc-500 transition-transform duration-200 group-open/adv:rotate-180" />
                    </summary>

                    <div className="mt-3 space-y-2 text-xs">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-zinc-400 text-[11px] font-medium">Compression engine</span>
                        <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-black/40 p-1 border border-white/[0.06]">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEngineManuallyChosen(false);
                              if (inspection) {
                                setSelectedEngine(inspection.suggestedEngine);
                              }
                            }}
                            className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer text-center ${
                              !isEngineManuallyChosen
                                ? "bg-white/10 text-white shadow-sm"
                                : "text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            Automatic
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEngineManuallyChosen(true);
                              setSelectedEngine("wasm");
                            }}
                            className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer text-center ${
                              isEngineManuallyChosen && selectedEngine === "wasm"
                                ? "bg-white/10 text-white shadow-sm"
                                : "text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            Ghostscript
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEngineManuallyChosen(true);
                              setSelectedEngine("canvas");
                            }}
                            className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer text-center ${
                              isEngineManuallyChosen && selectedEngine === "canvas"
                                ? "bg-white/10 text-white shadow-sm"
                                : "text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            Canvas
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-relaxed font-mono">
                        {!isEngineManuallyChosen
                          ? `Automatically optimized: ${selectedEngine === "wasm" ? "Ghostscript (Vector & Text)" : "Canvas (Rasterizer)"}`
                          : selectedEngine === "wasm"
                          ? "Ghostscript WASM preserves selectable text & vector paths."
                          : "Canvas Rasterizer compresses pages into optimized images."}
                      </p>
                    </div>
                  </details>

                  {/* Error Message */}
                  {errorMessage && (
                    <div className="animate-pop-in mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Compress Trigger Button */}
                  <button
                    type="button"
                    onClick={runCompression}
                    className="mt-4 sm:mt-5 group relative flex w-full items-center justify-center gap-2 rounded-xl py-3.5 px-5 text-sm font-medium bg-white text-black shadow-[0_0_28px_rgba(255,255,255,0.22)] hover:bg-zinc-100 cursor-pointer pressable touch-manipulation min-h-[48px]"
                  >
                    <span>Compress PDF</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-1" />
                  </button>
                </div>
              )}

              {/* Error Message when no file is chosen yet */}
              {!file && errorMessage && (
                <div className="animate-pop-in mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feature Cards Grid: 1 column on mobile, 3 on desktop */}
        <div className="mt-10 sm:mt-14 grid w-full grid-cols-1 gap-3 sm:gap-4 text-left sm:grid-cols-3">
          <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.035]">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <h4 className="mt-3 text-xs sm:text-sm font-medium text-white">Private by design</h4>
            <p className="mt-1.5 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
              Your PDFs are processed locally in your browser. They never need to be uploaded.
            </p>
          </div>

          <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.035]">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300">
              <Sparkles className="h-4 w-4 text-zinc-300" />
            </div>
            <h4 className="mt-3 text-xs sm:text-sm font-medium text-white">Smart compression</h4>
            <p className="mt-1.5 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
              Automatically chooses the appropriate compression strategy for your document.
            </p>
          </div>

          <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.035]">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300">
              <SlidersHorizontal className="h-4 w-4 text-zinc-300" />
            </div>
            <h4 className="mt-3 text-xs sm:text-sm font-medium text-white">Quality control</h4>
            <p className="mt-1.5 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
              Choose between maximum reduction, balanced compression, high quality, and print-ready output.
            </p>
          </div>
        </div>

        {/* Technical Architecture Section */}
        <div className="mt-12 sm:mt-16 w-full text-left">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Cpu className="h-4 w-4 text-zinc-400" />
            <h3 className="text-xs sm:text-sm font-medium tracking-wide text-zinc-300">
              Technical Architecture
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 sm:p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                Ghostscript WASM
              </div>
              <p className="mt-1.5 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
                Preserves selectable text, vectors, and document structure where possible.
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 sm:p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Canvas Rasterizer
              </div>
              <p className="mt-1.5 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
                Useful for scanned or image-heavy PDFs.
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 sm:p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                Automatic Optimization
              </div>
              <p className="mt-1.5 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
                SqueezePDF selects the appropriate compression strategy based on the document.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
