import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".signalibrium-next",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
