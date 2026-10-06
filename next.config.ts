import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AgentDesk is a fully authenticated, database-backed application. We opt out
  // of Cache Components / partial prerendering so pages reading the session
  // (cookies) and database render dynamically per request.
  cacheComponents: false,
  partialPrefetching: false,
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
