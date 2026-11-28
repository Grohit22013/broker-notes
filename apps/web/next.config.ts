import type { NextConfig } from "next";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
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
