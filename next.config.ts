import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      // The Sub-teams area was renamed to Teams; keep old links working.
      { source: "/sub-teams", destination: "/teams", permanent: true },
    ];
  },
};

export default nextConfig;
