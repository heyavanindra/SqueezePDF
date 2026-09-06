"use client";
import { cn } from "@/lib/utils";
import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { IconUpload, IconX, IconFileText } from "@tabler/icons-react";
import { useDropzone } from "react-dropzone";

const mainVariant = {
  initial: {
    x: 0,
    y: 0,
  },
  animate: {
    x: 16,
    y: -16,
    opacity: 0.95,
  },
};

const secondaryVariant = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
};

export const FileUpload = ({
  onChange,
  file,
  onClear,
  accept = { "application/pdf": [".pdf"] },
  maxSize = 50 * 1024 * 1024,
}: {
  onChange?: (files: File[]) => void;
  file?: File | null;
  onClear?: () => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
}) => {
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const files = file !== undefined ? (file ? [file] : []) : internalFiles;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (newFiles: File[]) => {
    if (!newFiles || newFiles.length === 0) return;
    const selected = newFiles[0];
    setInternalFiles([selected]);
    onChange && onChange([selected]);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInternalFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClear && onClear();
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    accept,
    maxSize,
    onDrop: handleFileChange,
    onDropRejected: (fileRejections) => {
      console.warn("File rejected:", fileRejections);
    },
  });

  return (
    <div className="w-full select-none touch-manipulation" {...getRootProps()}>
      <motion.div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        whileHover="animate"
        className={cn(
          "group/file relative block w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-6 sm:p-9 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50",
          isDragActive
            ? "border-emerald-500/60 bg-emerald-500/[0.03] shadow-[0_0_32px_rgba(16,185,129,0.1)]"
            : "border-white/10 bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.025]"
        )}
      >
        <input
          ref={fileInputRef}
          id="file-upload-handle"
          type="file"
          accept="application/pdf"
          onChange={(e) => handleFileChange(Array.from(e.target.files || []))}
          className="hidden"
        />
        <div className="absolute inset-0 pointer-events-none overflow-hidden [mask-image:radial-gradient(ellipse_at_center,white,transparent)] opacity-35">
          <GridPattern />
        </div>
        <div className="relative z-20 flex flex-col items-center justify-center w-full">
          {!files.length ? (
            <>
              <p className="font-sans text-base sm:text-lg font-semibold text-white tracking-tight">
                {isDragActive ? "Release to drop your PDF" : "Drop your PDF here"}
              </p>
              <p className="mt-1 font-sans text-xs sm:text-sm text-zinc-400 max-w-xs text-center">
                or click to browse from your device
              </p>
              <span className="mt-2.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-mono text-zinc-400">
                PDF · Max 50 MB
              </span>
            </>
          ) : (
            <div className="flex items-center justify-between w-full max-w-lg mb-2 text-left">
              <span className="text-xs font-medium text-zinc-400">Selected Document</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick();
                }}
                className="text-[11px] text-zinc-400 hover:text-white underline cursor-pointer"
              >
                Choose another file
              </button>
            </div>
          )}

          <div className="relative mx-auto mt-4 sm:mt-6 w-full max-w-lg">
            {files.length > 0 &&
              files.map((f, idx) => (
                <motion.div
                  key={"file-" + idx + "-" + f.name}
                  layoutId="file-upload-card"
                  initial={{ opacity: 0, scale: 0.96, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "relative z-40 mx-auto flex w-full flex-col items-start justify-start overflow-hidden rounded-xl border border-white/12 bg-[#161618]/95 p-3.5 sm:p-4 shadow-xl backdrop-blur-xl"
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300">
                        <IconFileText className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-xs sm:text-sm font-medium text-white max-w-[130px] sm:max-w-xs">
                          {f.name}
                        </p>
                        <p className="font-mono text-[10px] sm:text-[11px] text-zinc-400">
                          {(f.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] sm:text-[10px] font-mono text-zinc-300">
                        PDF
                      </span>
                      {onClear && (
                        <button
                          type="button"
                          onClick={handleClear}
                          className="touch-manipulation rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white active:scale-90 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                          title="Remove file"
                        >
                          <IconX className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}

            {!files.length && (
              <motion.div
                layoutId="file-upload"
                variants={mainVariant}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
                className={cn(
                  "relative z-40 mx-auto flex h-20 w-24 sm:h-28 sm:max-w-[7.5rem] items-center justify-center rounded-2xl border border-white/12 bg-white/[0.03] shadow-[0_12px_36px_rgba(0,0,0,0.4)] backdrop-blur-md transition-shadow group-hover/file:shadow-[0_0_24px_rgba(255,255,255,0.08)]"
                )}
              >
                {isDragActive ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-1 text-emerald-400 text-xs font-medium"
                  >
                    <span className="text-[11px]">Drop PDF</span>
                    <IconUpload className="h-4 w-4 text-emerald-400" />
                  </motion.div>
                ) : (
                  <IconUpload className="h-5 w-5 sm:h-6 sm:w-6 text-zinc-300 transition-transform duration-200 group-hover/file:scale-110 group-hover/file:text-white" />
                )}
              </motion.div>
            )}

            {!files.length && (
              <motion.div
                variants={secondaryVariant}
                className="absolute inset-0 z-30 mx-auto flex h-20 w-24 sm:h-28 sm:max-w-[7.5rem] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] opacity-0"
              />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export function GridPattern() {
  const columns = 36;
  const rows = 10;
  return (
    <div className="flex shrink-0 scale-105 flex-wrap items-center justify-center gap-x-px gap-y-px bg-white/[0.02]">
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((_, col) => {
          const index = row * columns + col;
          return (
            <div
              key={`${col}-${row}`}
              className={`flex h-8 w-8 shrink-0 rounded-[2px] ${
                index % 2 === 0
                  ? "bg-white/[0.015]"
                  : "bg-transparent border border-white/[0.02]"
              }`}
            />
          );
        })
      )}
    </div>
  );
}
