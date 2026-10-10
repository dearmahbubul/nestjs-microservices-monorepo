import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Served under /admin by the nginx reverse proxy (docker/nginx/nginx.conf). */
  basePath: "/admin",
  experimental: {
    agentFeedback: true,
  },
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
