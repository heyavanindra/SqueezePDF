import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    resolveAlias: {
      fs: { browser: "./src/utils/empty-shim.ts" },
      module: { browser: "./src/utils/empty-shim.ts" },
      path: { browser: "./src/utils/empty-shim.ts" },
    },
  },
};

export default nextConfig;
