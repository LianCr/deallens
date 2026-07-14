import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so stray lockfiles in parent directories
  // can't confuse output file tracing.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
