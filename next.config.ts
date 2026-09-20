import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "ai/react": "@ai-sdk/react",
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "ai/react": "@ai-sdk/react",
    };
    return config;
  },
};

export default nextConfig;
