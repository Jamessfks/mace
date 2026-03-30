import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Acknowledge Turbopack (Next.js 16 default). Webpack config below applies when using --webpack.
  // Some browser bundles still reference Node built-ins in dead code; stub them.
  turbopack: {
    resolveAlias: {
      fs: { browser: "./lib/empty-module.js" },
      path: { browser: "./lib/empty-module.js" },
      "plotly.js/dist/plotly": "plotly.js-dist-min",
    },
  },
  // Stub Node built-ins out for browser builds.
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
