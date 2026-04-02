import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
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
