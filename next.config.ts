import type { NextConfig } from "next";

// Curated photo crops are served from an external Cloudflare R2 bucket
// (the single deliberate exception to the no-binaries rule; CLAUDE.md).
// NEXT_PUBLIC_IMAGE_BASE_URL e.g. https://img.example.com — unset means
// no images render anywhere, which is a safe default.
const imageBase = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;

const nextConfig: NextConfig = {
  images: imageBase
    ? { remotePatterns: [new URL(`${imageBase.replace(/\/+$/, "")}/photos/**`)] }
    : undefined,
};

export default nextConfig;
