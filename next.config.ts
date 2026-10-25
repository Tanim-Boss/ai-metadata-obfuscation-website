import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev"],
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
