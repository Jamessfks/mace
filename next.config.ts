import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Acknowledge Turbopack (Next.js 16 default). Webpack config below applies when using --webpack.
  // RDKit.js WASM references Node built-ins (fs, path) in its loader; stub them for browser builds.
  turbopack: {
    resolveAlias: {
      fs: { browser: "./lib/empty-module.js" },
      path: { browser: "./lib/empty-module.js" },
      "plotly.js/dist/plotly": "plotly.js-dist-min",
    },
  },
  // RDKit.js WASM module references Node built-ins (fs, path) in its loader.
  // Stub them out for the browser build so the WASM loads client-side only.
  // If Turbopack has issues with WASM, run: next dev --webpack
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    return config;
  },
};

export default nextConfig;
