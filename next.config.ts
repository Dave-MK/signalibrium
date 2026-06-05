import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const localDistDir = process.env.SIGNALIBRIUM_NEXT_DIST_DIR?.trim();
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  ...(localDistDir ? { distDir: localDistDir } : {}),
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
