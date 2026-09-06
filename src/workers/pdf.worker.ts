/// <reference lib="webworker" />

import loadGhostscript, {
  GhostscriptModule,
  GhostscriptOptions,
} from "@jspawn/ghostscript-wasm/gs.js";

declare const self: DedicatedWorkerGlobalScope;

export interface CompressMessageData {
  type: "compress" | "init";
  pdf?: ArrayBuffer | Uint8Array;
  quality?: "screen" | "ebook" | "printer" | "prepress" | string;
  wasmUrl?: string;
  wasmBinary?: ArrayBuffer;
  customArgs?: string[];
  totalPages?: number;
}

export interface CompleteMessageResponse {
  type: "complete";
  pdf: Uint8Array;
}

export type ProgressStage = "init" | "parsing" | "page" | "finalizing";

export interface ProgressMessageResponse {
  type: "progress";
  message: string;
  stage?: ProgressStage;
  page?: number;
  totalPages?: number;
}

export interface ErrorMessageResponse {
  type: "error";
  error: string;
}

export interface ReadyMessageResponse {
  type: "ready";
}

export type WorkerResponse =
  | CompleteMessageResponse
  | ProgressMessageResponse
  | ErrorMessageResponse
  | ReadyMessageResponse;

const SETTINGS: Record<string, string> = {
  screen: "/screen",     // 72 dpi (smallest size, best for web)
  ebook: "/ebook",       // 150 dpi (medium size, balanced)
  printer: "/printer",   // 300 dpi (high quality)
  prepress: "/prepress", // 300 dpi (color preserved)
  default: "/default",
};

let gsInstance: GhostscriptModule | null = null;
let initPromise: Promise<GhostscriptModule> | null = null;
let currentTotalPages = 1;
let lastReportedPage = 0;

function estimatePdfPages(bytes: Uint8Array): number {
  try {
    const decoder = new TextDecoder("latin1");
    const sample = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 2 * 1024 * 1024)));
    const matches = sample.match(/\/Type\s*\/Page\b/g);
    if (matches && matches.length > 0) {
      return matches.length;
    }
  } catch {
    // fallback
  }
  return 1;
}

function parseAndForwardGhostscriptLog(text: string) {
  if (!text || !text.trim()) return;
  const trimmed = text.trim();

  // Match "Page 1", "Page 2", etc.
  const pageMatch = trimmed.match(/^Page\s+(\d+)$/i);
  if (pageMatch) {
    const page = parseInt(pageMatch[1], 10);
    lastReportedPage = page;
    const isFinalPage = page >= currentTotalPages;
    self.postMessage({
      type: "progress",
      stage: isFinalPage ? "finalizing" : "page",
      message: isFinalPage
        ? `Finalizing page ${page} of ${currentTotalPages}...`
        : `Optimizing page ${page} of ${currentTotalPages}...`,
      page,
      totalPages: currentTotalPages,
    } satisfies ProgressMessageResponse);
    return;
  }

  // Match font loading
  if (trimmed.includes("Loading font")) {
    const fontMatch = trimmed.match(/Loading font\s+([^\s(]+)/i);
    const fontName = fontMatch ? fontMatch[1] : "vector font";
    self.postMessage({
      type: "progress",
      stage: "page",
      message: `Subsetting ${fontName} for page ${lastReportedPage || 1}...`,
      page: lastReportedPage || 1,
      totalPages: currentTotalPages,
    } satisfies ProgressMessageResponse);
    return;
  }

  // Match general processing stages
  if (trimmed.includes("Processing pages")) {
    self.postMessage({
      type: "progress",
      stage: "parsing",
      message: `Processing pages 1 through ${currentTotalPages}...`,
      page: 1,
      totalPages: currentTotalPages,
    } satisfies ProgressMessageResponse);
    return;
  }

  // Match repaired or warning notices
  if (trimmed.includes("PDF file was repaired") || trimmed.includes("errors that were repaired")) {
    self.postMessage({
      type: "progress",
      stage: "finalizing",
      message: "Repaired non-standard PDF objects in memory...",
      page: currentTotalPages,
      totalPages: currentTotalPages,
    } satisfies ProgressMessageResponse);
    return;
  }
}

// Intercept and silence Emscripten's console.log and console.warn inside this worker
console.log = (...args: any[]) => {
  const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  parseAndForwardGhostscriptLog(text);
};

console.warn = (...args: any[]) => {
  const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  parseAndForwardGhostscriptLog(text);
};

async function getGhostscript(
  wasmUrl?: string,
  wasmBinary?: ArrayBuffer
): Promise<GhostscriptModule> {
  if (gsInstance) {
    return gsInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const options: GhostscriptOptions = {
      locateFile: (filePath: string, prefix = "") => {
        if (filePath.endsWith(".wasm")) {
          return wasmUrl || "/gs.wasm";
        }
        return prefix + filePath;
      },
      print: (text: string) => {
        parseAndForwardGhostscriptLog(text);
      },
      printErr: (text: string) => {
        parseAndForwardGhostscriptLog(text);
      },
    };

    if (wasmBinary) {
      options.instantiateWasm = (
        imports: WebAssembly.Imports,
        receiveInstance: (instance: WebAssembly.Instance, module?: WebAssembly.Module) => void
      ) => {
        WebAssembly.instantiate(wasmBinary, imports)
          .then((res) => {
            receiveInstance(res.instance, res.module);
          })
          .catch((err) => {
            console.error("[ghostscript-wasm instantiateWasm error]", err);
          });
        return {};
      };
    }

    try {
      gsInstance = await loadGhostscript(options);
      return gsInstance;
    } catch (err) {
      initPromise = null;
      gsInstance = null;
      throw err;
    }
  })();

  return initPromise;
}

self.onmessage = async (event: MessageEvent<CompressMessageData>) => {
  const { type, pdf, quality = "ebook", wasmUrl, wasmBinary, customArgs, totalPages } =
    event.data || {};

  if (type === "init") {
    try {
      self.postMessage({
        type: "progress",
        stage: "init",
        message: "Loading Ghostscript WebAssembly engine...",
      } satisfies ProgressMessageResponse);
      await getGhostscript(wasmUrl, wasmBinary);
      self.postMessage({ type: "ready" } satisfies ReadyMessageResponse);
    } catch (error) {
      self.postMessage({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      } satisfies ErrorMessageResponse);
    }
    return;
  }

  if (type !== "compress") {
    return;
  }

  if (!pdf) {
    self.postMessage({
      type: "error",
      error: "No PDF data provided for compression.",
    } satisfies ErrorMessageResponse);
    return;
  }

  let gs: GhostscriptModule | null = null;

  try {
    self.postMessage({
      type: "progress",
      stage: "init",
      message: "Initializing WebAssembly environment...",
    } satisfies ProgressMessageResponse);

    // Load or get cached Ghostscript WASM module
    gs = await getGhostscript(wasmUrl, wasmBinary);

    // Convert input to Uint8Array
    const inputBytes = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);

    if (inputBytes.byteLength === 0) {
      throw new Error("Input PDF buffer is empty.");
    }

    // Set page count: prefer exact page count from inspector, fallback to estimation
    lastReportedPage = 0;
    currentTotalPages = Math.max(1, totalPages || estimatePdfPages(inputBytes));

    self.postMessage({
      type: "progress",
      stage: "parsing",
      message: `Writing document to memory & parsing structure (${currentTotalPages} pages)...`,
      totalPages: currentTotalPages,
    } satisfies ProgressMessageResponse);

    // Clean up any stale files from previous operations
    try {
      gs.FS.unlink("/input.pdf");
    } catch {
      // Ignored if file doesn't exist
    }
    try {
      gs.FS.unlink("/output.pdf");
    } catch {
      // Ignored if file doesn't exist
    }

    // Write PDF into WASM in-memory filesystem
    gs.FS.writeFile("/input.pdf", inputBytes);

    const pdfSetting = SETTINGS[quality] || SETTINGS.ebook;

    const commandArgs =
      customArgs && customArgs.length > 0
        ? customArgs
        : [
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            `-dPDFSETTINGS=${pdfSetting}`,
            "-dNOPAUSE",
            "-dBATCH",
            "-sOutputFile=/output.pdf",
            "/input.pdf",
          ];

    self.postMessage({
      type: "progress",
      stage: "parsing",
      message: `Starting vector optimization (${currentTotalPages} pages)...`,
      page: 1,
      totalPages: currentTotalPages,
    } satisfies ProgressMessageResponse);

    // Execute Ghostscript CLI
    const exitCode = await gs.callMain(commandArgs);

    self.postMessage({
      type: "progress",
      stage: "finalizing",
      message: "Finalizing and linearizing output PDF...",
      page: currentTotalPages,
      totalPages: currentTotalPages,
    } satisfies ProgressMessageResponse);

    // Read compressed PDF from WASM filesystem
    let output: Uint8Array;
    try {
      output = gs.FS.readFile("/output.pdf");
    } catch (readErr) {
      throw new Error(
        `Ghostscript failed to create output.pdf (exitCode: ${exitCode}): ${String(
          readErr
        )}`
      );
    }

    if (!output || output.length === 0) {
      throw new Error("Ghostscript produced an empty output file.");
    }

    // Send back the compressed PDF using transferable array buffer
    self.postMessage(
      {
        type: "complete",
        pdf: output,
      } satisfies CompleteMessageResponse,
      [output.buffer]
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    } satisfies ErrorMessageResponse);
  } finally {
    // Free memory by unlinking ephemeral files in the WASM FS
    if (gs) {
      try {
        gs.FS.unlink("/input.pdf");
      } catch {
        // Safe ignore
      }
      try {
        gs.FS.unlink("/output.pdf");
      } catch {
        // Safe ignore
      }
    }
  }
};