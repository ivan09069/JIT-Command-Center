import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The dev server is opened as both localhost and 127.0.0.1.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
