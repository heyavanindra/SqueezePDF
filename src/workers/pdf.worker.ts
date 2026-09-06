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
}

export interface CompleteMessageResponse {
  type: "complete";
  pdf: Uint8Array;
}

export interface ProgressMessageResponse {
  type: "progress";
  message: string;
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
        if (text && text.trim()) {
          const trimmed = text.trim();
          const pageMatch = trimmed.match(/Page\s+(\d+)/i);
          const page = pageMatch ? parseInt(pageMatch[1], 10) : undefined;
          self.postMessage({
            type: "progress",
            message: page ? `Processing Page ${page} of ${currentTotalPages}` : trimmed,
            page,
            totalPages: currentTotalPages,
          } satisfies ProgressMessageResponse);
        }
      },
      printErr: (text: string) => {
        if (text && text.trim()) {
          console.warn("[ghostscript-wasm stderr]", text.trim());
        }
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
  const { type, pdf, quality = "ebook", wasmUrl, wasmBinary, customArgs } =
    event.data || {};

  if (type === "init") {
    try {
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
    // Load or get cached Ghostscript WASM module
    gs = await getGhostscript(wasmUrl, wasmBinary);

    // Convert input to Uint8Array
    const inputBytes = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);

    if (inputBytes.byteLength === 0) {
      throw new Error("Input PDF buffer is empty.");
    }

    // Estimate page count for granular progress feedback
    currentTotalPages = Math.max(1, estimatePdfPages(inputBytes));

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

    // Execute Ghostscript CLI
    const exitCode = await gs.callMain(commandArgs);

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