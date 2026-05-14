import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // node:sqlite はバンドル対象から除外（Node.js ビルトインのため）
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.kie.ai" },
      { protocol: "https", hostname: "**.blob.vercel-storage.com" },
    ],
  },
}

export default nextConfig
