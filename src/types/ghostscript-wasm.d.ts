declare module "@jspawn/ghostscript-wasm" {
  export interface GhostscriptFS {
    writeFile(path: string, data: Uint8Array | string, options?: { encoding?: string; flags?: string }): void;
    readFile(path: string, options?: { encoding?: string; flags?: string }): Uint8Array;
    unlink(path: string): void;
    stat(path: string): { size: number; [key: string]: unknown };
    readdir(path: string): string[];
  }

  export interface GhostscriptModule {
    callMain(args: string[]): number;
    FS: GhostscriptFS;
    [key: string]: unknown;
  }

  export interface GhostscriptOptions {
    locateFile?: (path: string, prefix?: string) => string;
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      receiveInstance: (instance: WebAssembly.Instance, module?: WebAssembly.Module) => void
    ) => Record<string, unknown> | false | void;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
    [key: string]: unknown;
  }

  export default function loadGhostscript(options?: GhostscriptOptions): Promise<GhostscriptModule>;
}

declare module "@jspawn/ghostscript-wasm/gs.js" {
  import { GhostscriptModule, GhostscriptOptions } from "@jspawn/ghostscript-wasm";
  export * from "@jspawn/ghostscript-wasm";
  export default function loadGhostscript(options?: GhostscriptOptions): Promise<GhostscriptModule>;
}
