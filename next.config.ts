import type { NextConfig } from "next";

// Security headers on every response.
const securityHeaders = [
  // Nobody may embed our pages in a frame (stops clickjacking of the login/exam pages).
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers only honour this over HTTPS; forces HTTPS for a year once seen.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

// Extra hostnames allowed to open the DEV server (e.g. the server's public IP when testing
// remotely). Without this, Next.js blocks its dev scripts and pages stop working.
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false, // don't advertise the framework
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
