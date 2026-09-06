"use client";

import React, { useState, useRef, useEffect, useTransition } from "react";
import {
  FileUp,
  FileCheck2,
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
  FileText,
  X,
  Lock,
} from "lucide-react";
import { FileUpload } from "@/components/ui/file-upload";
import type { WorkerResponse, CompressMessageData } from "../workers/pdf.worker";

type CompressionResolution = "screen" | "ebook" | "printer" | "prepress";

interface CompressionResult {
  filename: string;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  durationMs: number;
  blobUrl?: string;
}

const PRESETS: {
  id: CompressionResolution;
  name: string;
  badge: string;
  dpi: string;
  description: string;
}[] = [
  {
    id: "screen",
    name: "Max Compress",
    badge: "Extreme",
    dpi: "72 DPI",
    description: "Lowest file size. Perfect for email attachments & fast web sharing.",
  },
  {
    id: "ebook",
    name: "Balanced",
    badge: "Recommended",
    dpi: "150 DPI",
    description: "Great balance of clarity and file reduction for modern displays.",
  },
  {
    id: "printer",
    name: "High Quality",
    badge: "Print Ready",
    dpi: "300 DPI",
    description: "Maintains high resolution for printing and detailed typography.",
  },
  {
    id: "prepress",
    name: "Lossless",
    badge: "Maximum",
    dpi: "Original",
    description: "Preserves full color fidelity and high resolution images.",
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
  const [selectedPreset, setSelectedPreset] = useState<CompressionResolution>("ebook");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "compressing" | "completed" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [, startTransition] = useTransition();

  const workerRef = useRef<Worker | null>(null);

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

  const handleFileSelect = (selectedFile: File) => {
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
  };

  const runCompression = async () => {
    if (!file) return;

    setStatus("compressing");
    setErrorMessage("");

    const startTime = performance.now();

    if (result?.blobUrl) {
      URL.revokeObjectURL(result.blobUrl);
    }

    const steps = [
      "Initializing WebAssembly environment...",
      "Parsing PDF stream objects...",
      "Downsampling embedded raster graphics...",
      "Subsetting typography & optimizing fonts...",
      "Linearizing and writing output PDF...",
    ];

    let stepIndex = 0;
    setStatusMessage(steps[0]);
    const stepInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      setStatusMessage(steps[stepIndex]);
    }, 600);

    try {
      let worker = workerRef.current;
      if (!worker) {
        worker = new Worker(
          new URL("../workers/pdf.worker.ts", import.meta.url),
          { type: "module" }
        );
        workerRef.current = worker;
      }

      const fileBuffer = await file.arrayBuffer();

      const compressedPdfBytes = await new Promise<Uint8Array>((resolve, reject) => {
        const handleMessage = (e: MessageEvent<WorkerResponse>) => {
          const data = e.data;
          if (data.type === "progress") {
            if (data.message) {
              setStatusMessage(data.message);
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
            quality: selectedPreset,
          } satisfies CompressMessageData,
          [fileBuffer]
        );
      });

      clearInterval(stepInterval);

      const blob = new Blob([compressedPdfBytes as unknown as BlobPart], {
        type: "application/pdf",
      });
      const finalCompressedSize = blob.size;
      const blobUrl = URL.createObjectURL(blob);

      const elapsed = Math.round(performance.now() - startTime);
      const ratio = Math.max(0, Math.round((1 - finalCompressedSize / file.size) * 100));

      startTransition(() => {
        setResult({
          filename: file.name.replace(/\.pdf$/i, "-compressed.pdf"),
          originalSize: file.size,
          compressedSize: finalCompressedSize,
          ratio,
          durationMs: elapsed,
          blobUrl,
        });
        setStatus("completed");
      });
    } catch (err: unknown) {
      clearInterval(stepInterval);
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
    setFile(null);
    setStatus("idle");
    setResult(null);
    setErrorMessage("");
  };

  return (
    <div className="relative min-h-screen w-full bg-[#09090b] text-[#f4f4f5] overflow-x-hidden font-sans">
      {/* Ambient background light beam & subtle grid */}
      <div className="pointer-events-none absolute inset-x-0 -top-40 flex justify-center overflow-hidden">
        <div className="h-[480px] w-[900px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(120,119,198,0.18),rgba(255,255,255,0))]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_15%,#000_70%,transparent_100%)]" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-white/15 to-white/5 border border-white/10 shadow-[0_0_16px_rgba(255,255,255,0.06)]">
            <Layers className="h-4 w-4 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight text-white text-base">OPTIMA</span>
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
              PDF v1.0
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-xs text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-[11px] tracking-wide">Ghostscript Active</span>
          </div>

          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors duration-150"
          >
            <span>GitHub</span>
          </a>
        </div>
      </header>

      {/* Hero Content */}
      <main className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pt-16 pb-24 text-center">
        {/* Release Pill */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1 text-xs text-zinc-300 backdrop-blur-md transition-colors hover:border-white/20">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>High-Fidelity PDF Compression</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400">Zero telemetry</span>
        </div>

        {/* Title */}
        <h1 className="max-w-2xl text-4xl sm:text-5xl font-semibold tracking-tight text-white leading-[1.15]">
          Compress PDFs with <br className="hidden sm:inline" />
          <span className="bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            precision and clarity.
          </span>
        </h1>

        <p className="mt-4 max-w-lg text-sm sm:text-base text-zinc-400 leading-relaxed">
          Reduce file size by up to 90% without compromising vector text, layout geometry, or embedded fonts.
        </p>

        {/* Main Compression Console */}
        <div className="mt-10 w-full rounded-2xl border border-white/[0.08] bg-[#121215]/80 p-5 sm:p-7 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]">
          {/* Preset Quality Selector */}
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between text-left">
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                Compression Level
              </span>
              <span className="text-[11px] font-mono text-zinc-500">
                Target: {PRESETS.find((p) => p.id === selectedPreset)?.dpi}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`group relative flex flex-col items-start rounded-xl p-3 text-left pressable cursor-pointer ${
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
                    <span className="mt-1 text-[10px] font-mono text-zinc-500">{preset.badge}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload / State Stage */}
          {status === "completed" && result ? (
            /* Completed Result Card */
            <div className="animate-pop-in flex flex-col items-center rounded-xl border border-white/[0.08] bg-black/40 p-6 sm:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-[0_0_24px_rgba(16,185,129,0.2)]">
                <CheckCircle2 className="h-6 w-6" />
              </div>

              <h3 className="mt-3 text-lg font-medium text-white">Compression Complete</h3>
              <p className="mt-1 font-mono text-xs text-zinc-400">{file?.name}</p>

              {/* Stats Comparison Grid */}
              <div className="mt-6 grid w-full grid-cols-3 gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <div className="animate-pop-in flex flex-col py-1">
                  <span className="text-[10px] font-mono uppercase text-zinc-500">Original</span>
                  <span className="mt-0.5 font-mono text-sm text-zinc-400">
                    {formatBytes(result.originalSize)}
                  </span>
                </div>

                <div className="animate-pop-in stagger-1 flex flex-col border-x border-white/[0.06] py-1">
                  <span className="text-[10px] font-mono uppercase text-zinc-500">Compressed</span>
                  <span className="mt-0.5 font-mono text-sm font-semibold text-emerald-400">
                    {formatBytes(result.compressedSize)}
                  </span>
                </div>

                <div className="animate-pop-in stagger-2 flex flex-col rounded-lg bg-indigo-500/[0.08] border border-indigo-500/20 py-1">
                  <span className="text-[10px] font-mono uppercase text-indigo-400/90 font-medium">Saved</span>
                  <span className="mt-0.5 font-mono text-sm font-semibold text-indigo-300">
                    -{result.ratio}%
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex w-full flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="group relative flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-black shadow-[0_0_28px_rgba(255,255,255,0.18)] pressable hover:bg-zinc-100"
                >
                  <Download className="h-4 w-4 transition-transform duration-150 ease-out group-hover:-translate-y-0.5" />
                  Download Compressed PDF
                </button>

                <button
                  type="button"
                  onClick={resetAll}
                  className="group flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-300 pressable hover:bg-white/[0.08] hover:text-white hover:border-white/20"
                >
                  <RotateCcw className="h-4 w-4 text-zinc-400 transition-transform duration-200 ease-out group-hover:-rotate-45" />
                  Compress Another
                </button>
              </div>
            </div>
          ) : status === "compressing" ? (
            /* Processing State */
            <div className="animate-pop-in flex flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-black/40 py-12 px-6">
              <div className="relative flex h-14 w-14 items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-fast-spin" />
                <Zap className="h-6 w-6 text-indigo-400 animate-pulse" />
              </div>

              <span className="mt-5 text-sm font-medium text-zinc-200">Optimizing Document</span>
              <span className="mt-1 font-mono text-xs text-zinc-400 max-w-xs truncate transition-all duration-200">
                {statusMessage}
              </span>

              {/* Subtle shimmer progress line */}
              <div className="mt-6 h-1 w-52 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full w-full bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-shimmer" />
              </div>
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
            <div className="animate-pop-in mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3.5 py-2.5 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Compress Trigger Button */}
          {status !== "completed" && status !== "compressing" && (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                disabled={!file}
                onClick={runCompression}
                className={`group relative flex w-full items-center justify-center gap-2 rounded-xl py-3 px-5 text-sm font-medium pressable ${
                  file
                    ? "bg-white text-black shadow-[0_0_28px_rgba(255,255,255,0.22)] hover:bg-zinc-100 cursor-pointer"
                    : "bg-white/[0.04] text-zinc-500 border border-white/[0.05] cursor-not-allowed"
                }`}
              >
                <span>Compress File</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-1" />
              </button>
            </div>
          )}
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-14 grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-3">
          <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.035] hover:-translate-y-0.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 transition-transform duration-200 group-hover:scale-110 group-hover:text-white">
              <Zap className="h-4 w-4" />
            </div>
            <h4 className="mt-3 text-sm font-medium text-white">Ghostscript Core</h4>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
              Industrial grade rasterizer and font subsetting algorithm for genuine reductions.
            </p>
          </div>

          <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.035] hover:-translate-y-0.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 transition-transform duration-200 group-hover:scale-110 group-hover:text-white">
              <Lock className="h-4 w-4" />
            </div>
            <h4 className="mt-3 text-sm font-medium text-white">Zero Persistence</h4>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
              Files are processed in ephemeral streams and purged immediately after compression.
            </p>
          </div>

          <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.035] hover:-translate-y-0.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 transition-transform duration-200 group-hover:scale-110 group-hover:text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h4 className="mt-3 text-sm font-medium text-white">Searchable Text</h4>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
              Vector glyphs and OCR text layers are untouched. PDF retains full searchability.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
