# SqueezePDF — Dual-Engine Client-Side PDF Compressor

> **High-fidelity, private PDF compression running 100% in your browser.** Intelligently toggles between **Ghostscript WebAssembly** (vector & font preservation) and **HTML5 Canvas JS** (scanned raster reduction) with zero server uploads.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)
![WebAssembly](https://img.shields.io/badge/WebAssembly-Ghostscript_9.56-654FF0?logo=webassembly)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css)

---

## ✨ Features

- **🔒 100% Client-Side Privacy**: Zero files are ever uploaded to a remote server. All parsing, subsetting, and compression happens entirely in the browser's local memory (`Web Worker` / `WASM`).
- **⚡ Adaptive Dual-Engine Pipeline**:
  - **Ghostscript Core (WASM)**: Industrial vector subsetting and stream repacking. Keeps digital vector text searchable, preserves hyperlinks, tags, and crystal-clear typography.
  - **Canvas Rasterizer (JS)**: Uses PDF.js and jsPDF to render pages onto memory-managed HTML5 canvases and downsample image layers. Perfect for scanned invoices, receipts, contracts, and mobile devices.
- **🧠 Automatic Document Inspection**: Pre-scans character density across initial pages. Automatically recommends the optimal engine (e.g., warns against rasterizing digital vector reports, or suggests Canvas mode for image-heavy scans).
- **📊 Real-Time Page-by-Page Progress**:
  - Continuous mathematical progress tracking across every page.
  - Live page counter pill (`Processing: Page 42 of 115 • 36% done`).
  - Real-time ETA estimation based on actual per-page processing velocity.
  - Subtle glowing activity beacon and animated shimmer.
- **📱 iOS Safari & Mobile Memory Safety**:
  - Hardened against iOS WebKit Jetsam (OOM) memory termination.
  - Instant per-page resource cleanup (`page.cleanup()`) and explicit document teardown (`loadingTask.destroy()`).
  - Adaptive DPI downscaling for large documents ($>15\text{ MB}$) on mobile devices.
- **🎨 Emil Kowalski Design Engineering**:
  - Tactile press interactions (`:active { transform: scale(0.97); }`).
  - Custom cubic-bezier transition curves (`--ease-out`, `--ease-in-out`).
  - Full touch-friendly responsive interface with minimum 48px touch targets.
  - Global paste support (`Ctrl+V` / `Cmd+V`) and smooth drag-and-drop file upload.

---

## 🏗️ Architecture & Engine Matrix

| Criterion | Engine A: Ghostscript WASM | Engine B: Canvas / jsPDF |
| :--- | :--- | :--- |
| **Primary Target** | Digital vector reports, ebooks, contracts | Scanned documents, receipts, photos |
| **Searchable Text** | ✅ **Preserved** (lossless font/stream subsetting) | ❌ Converted to high-efficiency raster images |
| **Hyperlinks & Bookmarks** | ✅ **Preserved** | ❌ Flattened |
| **Engine Asset** | ~16 MB binary (`gs.wasm`) | ~300 KB JS libraries (`pdfjs-dist`, `jspdf`) |
| **Peak RAM Footprint** | Moderate–High (WebAssembly 32-bit linear heap) | Ultra-Low (strict per-page garbage collection) |
| **Speed (115 Pages)** | ~1.5–2.5 sec / page (in-depth vector parsing) | ~0.05 sec / page (GPU-accelerated 2D canvas) |
| **Mobile Safari Budget** | Recommended for files $<15\text{ MB}$ | Adaptive scale guard for files up to $50\text{ MB}$ |

---

## 🎛️ Quality Presets

### Ghostscript WASM Presets
- **Max Compress (72 DPI)**: Downsamples images to 72 DPI with bicubic interpolation. Best for strict email attachments and portal upload limits.
- **Balanced (150 DPI - Recommended)**: 150 DPI balanced resolution. Crisp reading on desktop and tablets with substantial size reduction.
- **High Quality (300 DPI)**: Maintains 300 DPI resolution for crisp print-ready output and fine typography.
- **Lossless (Original DPI)**: Retains original color streams and image fidelity while repacking PDF stream objects and removing orphaned metadata.

### Canvas Rasterizer Presets
- **Max Reduction**: 50% JPEG quality at $1.0\times$ viewport scale.
- **Balanced (Recommended)**: 65% JPEG quality at $1.25\times$ viewport scale.
- **High Clarity**: 80% JPEG quality at $1.5\times$ viewport scale for detailed diagrams.
- **Crisp Print**: 90% JPEG quality at $2.0\times$ super-sampled rasterization.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ or [Bun](https://bun.sh/) (recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/heyavanindra/realpdfcompressor.git
cd realpdfcompressor

# Install dependencies with Bun
bun install

# Or with npm / pnpm
npm install
```

### Running Locally

```bash
# Start the Next.js development server
bun dev

# Or with npm
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
bun run build
bun run start
```

---

## 📁 Project Structure

```text
├── public/
│   ├── gs.wasm                 # 16.2 MB Ghostscript WebAssembly binary
│   └── pdf.worker.min.mjs      # PDF.js worker script for rendering & inspection
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with Inter font and metadata
│   │   ├── page.tsx            # Main dual-engine UI and compression console
│   │   ├── globals.css         # Design system tokens and motion easings
│   │   └── api/health/         # Health check endpoint
│   ├── components/
│   │   └── ui/
│   │       ├── file-upload.tsx # Drag-and-drop & paste upload zone
│   │       └── progress.tsx    # Progress indicator with active shimmer
│   ├── utils/
│   │   ├── compressionRouter.ts# Pre-compression PDF character inspection & engine recommendation
│   │   └── canvasCompressor.ts # PDF.js + jsPDF memory-safe raster compression
│   └── workers/
│       └── pdf.worker.ts       # Dedicated Web Worker orchestrating Ghostscript WASM
```

---

## 🛡️ License

Distributed under the MIT License. Ghostscript WebAssembly is licensed under the GNU AGPLv3. See [LICENSE](LICENSE) for more details.
