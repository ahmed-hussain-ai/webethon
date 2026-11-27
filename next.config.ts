import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server only: allow opening it via the server's public IP (not just localhost).
  // Without this, Next 16 blocks the dev connection and the page never becomes interactive.
  allowedDevOrigins: ["31.97.14.213"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
