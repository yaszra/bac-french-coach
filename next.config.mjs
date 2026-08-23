/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The learner route budget in docs/12 is enforced in CI; this keeps the
  // build honest about what it ships.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Source files use ESM-correct `.js` specifiers that point at `.ts`
  // sources. tsc resolves these under `moduleResolution: bundler`; the
  // bundler needs to be told the same thing.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // No third-party embedding, and no sacred text in a referrer.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' data:",
              "media-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "frame-ancestors 'none'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
