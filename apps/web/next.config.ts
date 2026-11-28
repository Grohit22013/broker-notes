import type { NextConfig } from "next";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  experimental: {
    // The default proxy timeout (~30 s) is shorter than an AI analysis on a free reasoning model
    // (up to 2 × 45 s with a fallback), which surfaced as "socket hang up" → 500 in the browser.
    proxyTimeout: 120_000,
  },
  /**
   * The browser talks to the NestJS API through this same-origin proxy: the httpOnly session
   * cookie is first-party, and there's no CORS to configure. Server components call API_URL
   * directly (lib/api/server.ts).
   */
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
