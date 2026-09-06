"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Download,
  RotateCcw,
  SlidersHorizontal,
  ArrowRight,
  ArrowUp,
  Upload,
  X,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompressionEngine } from "@/utils/compressionRouter";

interface FloatingActionDockProps {
  status: "idle" | "compressing" | "completed" | "error";
  file: File | null;
  progress: number;
  result: {
    ratio: number;
    compressedSize: number;
    originalSize: number;
  } | null;
  selectedPresetName?: string;
  onCompress: () => void;
  onDownload: () => void;
  onReset: () => void;
  onCancel: () => void;
  onOpenUpload: () => void;
  onScrollToSettings?: () => void;
}

export function FloatingActionDock({
  status,
  file,
  progress,
  result,
  selectedPresetName = "Balanced",
  onCompress,
  onDownload,
  onReset,
  onCancel,
  onOpenUpload,
  onScrollToSettings,
}: FloatingActionDockProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 240);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Visibility logic:
  // - Always visible if a file is uploaded, compressing, or completed
  // - If no file is loaded, only reveal when scrolled down past the hero dropzone
  const isVisible = Boolean(file) || status !== "idle" || isScrolled;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.nav
          aria-label="Floating contextual actions"
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          className="fixed bottom-4 sm:bottom-6 inset-x-0 z-50 mx-auto flex items-center justify-center pointer-events-none px-4"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {/* Dock Shell with Stacked Alpha and Ambient Hairline */}
          <motion.div
            layout
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              "pointer-events-auto flex items-center gap-2 sm:gap-2.5 p-1.5 sm:p-2 rounded-full",
              "bg-[rgba(255,255,255,0.08)] backdrop-blur-2xl",
              "border border-[rgba(255,255,255,0.08)]",
              "shadow-[0_16px_40px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04),inset_0_1px_1px_rgba(255,255,255,0.15)]"
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {/* STATE 1: File Selected, Ready to Compress */}
              {status === "idle" && file && (
                <motion.div
                  key="dock-idle-file"
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className="flex items-center gap-2 sm:gap-2.5"
                >
                  {/* Secondary Circular Action: Clear / Choose Another */}
                  <button
                    type="button"
                    onClick={onReset}
                    aria-label="Remove document and reset"
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                      "bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] active:bg-[rgba(255,255,255,0.16)]",
                      "border border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.65)] hover:text-white",
                      "dock-tactile cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    )}
                  >
                    <X className="h-4 w-4" />
                  </button>

                  {/* Primary Central Pill: Compress Action */}
                  <button
                    type="button"
                    onClick={onCompress}
                    aria-label={`Compress PDF with ${selectedPresetName} preset`}
                    className={cn(
                      "group relative flex h-12 items-center gap-2 sm:gap-2.5 px-4 sm:px-6 rounded-full",
                      "bg-white text-black font-medium tracking-[-0.01em] text-xs sm:text-sm",
                      "shadow-[0_0_24px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.6)]",
                      "hover:bg-zinc-100 active:bg-zinc-200",
                      "dock-tactile cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    )}
                  >
                    <FileText className="h-4 w-4 text-zinc-600 group-hover:text-black transition-colors" />
                    <span>Compress PDF</span>
                    <span className="hidden sm:inline-flex items-center rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-mono text-zinc-700">
                      {selectedPresetName}
                    </span>
                    <ArrowRight className="h-4 w-4 text-black transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                  </button>

                  {/* Secondary Circular Action: Scroll to Quality Settings */}
                  <button
                    type="button"
                    onClick={() => {
                      if (onScrollToSettings) {
                        onScrollToSettings();
                      } else {
                        scrollToTop();
                      }
                    }}
                    aria-label="Scroll to compression level options"
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                      "bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] active:bg-[rgba(255,255,255,0.16)]",
                      "border border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.65)] hover:text-white",
                      "dock-tactile cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    )}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </button>
                </motion.div>
              )}

              {/* STATE 2: Compressing In-Progress */}
              {status === "compressing" && (
                <motion.div
                  key="dock-compressing"
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className="flex items-center gap-2 sm:gap-2.5"
                >
                  {/* Live Progress Central Pill */}
                  <div
                    className={cn(
                      "flex h-12 items-center gap-3 px-5 sm:px-6 rounded-full",
                      "bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]",
                      "text-[rgba(255,255,255,0.90)] font-medium tracking-[-0.01em] text-xs sm:text-sm"
                    )}
                  >
                    <div className="relative flex h-3 w-3 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                    </div>
                    <span>Compressing...</span>
                    <span className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                      {Math.round(progress)}%
                    </span>
                  </div>

                  {/* Circular Action: Cancel Button */}
                  <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Cancel active compression"
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                      "bg-[rgba(255,255,255,0.06)] hover:bg-red-500/20 active:bg-red-500/30",
                      "border border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.65)] hover:text-red-300",
                      "dock-tactile cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                    )}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              )}

              {/* STATE 3: Completed Result */}
              {status === "completed" && result && (
                <motion.div
                  key="dock-completed"
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className="flex items-center gap-2 sm:gap-2.5"
                >
                  {/* Secondary Circular Action: Compress Another */}
                  <button
                    type="button"
                    onClick={onReset}
                    aria-label="Compress another document"
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                      "bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] active:bg-[rgba(255,255,255,0.16)]",
                      "border border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.65)] hover:text-white",
                      "dock-tactile cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    )}
                  >
                    <RotateCcw className="h-4 w-4 transition-transform duration-200 ease-out hover:-rotate-45" />
                  </button>

                  {/* Primary Central Pill: Download Compressed PDF */}
                  <button
                    type="button"
                    onClick={onDownload}
                    aria-label={`Download compressed PDF (${result.ratio}% smaller)`}
                    className={cn(
                      "group flex h-12 items-center gap-2 sm:gap-2.5 px-4 sm:px-6 rounded-full",
                      "bg-white text-black font-medium tracking-[-0.01em] text-xs sm:text-sm",
                      "shadow-[0_0_24px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.6)]",
                      "hover:bg-zinc-100 active:bg-zinc-200",
                      "dock-tactile cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    )}
                  >
                    <Download className="h-4 w-4 transition-transform duration-150 group-hover:-translate-y-0.5" />
                    <span>Download PDF</span>
                    <span className="rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-semibold">
                      -{result.ratio}%
                    </span>
                  </button>

                  {/* Secondary Circular Action: Scroll to Top */}
                  <button
                    type="button"
                    onClick={scrollToTop}
                    aria-label="Scroll to top of the page"
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                      "bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] active:bg-[rgba(255,255,255,0.16)]",
                      "border border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.65)] hover:text-white",
                      "dock-tactile cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    )}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </motion.div>
              )}

              {/* STATE 4: Scrolled View with No File Loaded */}
              {status === "idle" && !file && isScrolled && (
                <motion.div
                  key="dock-scrolled-idle"
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className="flex items-center gap-2 sm:gap-2.5"
                >
                  <button
                    type="button"
                    onClick={onOpenUpload}
                    aria-label="Upload PDF document"
                    className={cn(
                      "group flex h-12 items-center gap-2.5 px-5 sm:px-6 rounded-full",
                      "bg-white text-black font-medium tracking-[-0.01em] text-xs sm:text-sm",
                      "shadow-[0_0_24px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.6)]",
                      "hover:bg-zinc-100 active:bg-zinc-200",
                      "dock-tactile cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    )}
                  >
                    <Upload className="h-4 w-4 text-zinc-600 transition-transform group-hover:-translate-y-0.5" />
                    <span>Upload PDF</span>
                    <span className="text-[10px] font-mono text-zinc-500">Max 50MB</span>
                  </button>

                  <button
                    type="button"
                    onClick={scrollToTop}
                    aria-label="Scroll to dropzone"
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                      "bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] active:bg-[rgba(255,255,255,0.16)]",
                      "border border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.65)] hover:text-white",
                      "dock-tactile cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                    )}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
