import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // tesseract.js (server-side OCR) ships a wasm core + worker; keep it external
  // so it's required from node_modules at runtime rather than bundled.
  serverExternalPackages: ["tesseract.js"],
  async redirects() {
    return [
      // The Sub-teams area was renamed to Teams; keep old links working.
      { source: "/sub-teams", destination: "/teams", permanent: true },
    ];
  },
};

export default nextConfig;
