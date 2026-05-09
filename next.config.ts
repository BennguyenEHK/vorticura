import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@xenova/transformers", "sharp", "pdfjs-dist"],
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // pdfjs-dist is an external package (not bundled by webpack), so Vercel's
  // Node File Trace (nft) only includes files it can statically trace.
  // pdf.worker.mjs is dynamically imported via a string path inside pdf.mjs
  // — nft cannot see that import, so it excludes the file from the bundle.
  // outputFileTracingIncludes forces nft to include the worker file for all
  // API routes (email webhooks + cron jobs both run the email pipeline).
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
};

export default nextConfig;
