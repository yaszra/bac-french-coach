import type { NextConfig } from "next";

/**
 * Security headers are set per-request in src/middleware.ts, so the content
 * security policy can carry a nonce instead of allowing 'unsafe-inline' for
 * scripts. The few headers that must also cover static assets — which the
 * middleware deliberately skips — are set here.
 */
const staticAssetHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/_next/static/:path*", headers: staticAssetHeaders }];
  },
};

export default nextConfig;
