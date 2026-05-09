import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: process.cwd(),
  typedRoutes: true,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
