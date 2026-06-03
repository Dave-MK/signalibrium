import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".signalibrium-build",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
