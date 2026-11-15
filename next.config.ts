import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev"],
  serverExternalPackages: ["sharp"],
  // Uploads are intentionally uncapped: document, photo and video files of any
  // size are accepted by the /api/inspect and /api/process routes, which read
  // the request body directly without a body-size limit.
};

export default nextConfig;
