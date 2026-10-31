import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Cloudflare quick tunnels get a random host per run; the wildcard keeps
  // the dashboard reachable without editing this file on every restart.
  allowedDevOrigins: ["*.trycloudflare.com"],
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
