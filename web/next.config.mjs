/** @type {import('next').NextConfig} */
const isStatic =
  process.env.STATIC_EXPORT === "1" || process.env.LEXVERSE_WEB_MODE === "static";

const rawBase = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/^\/+|\/+$/g, "");
const basePath = rawBase ? `/${rawBase}` : "";

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  trailingSlash: true,
  ...(isStatic ? { output: "export", images: { unoptimized: true } } : {}),
  env: {
    NEXT_PUBLIC_BUILD_MODE: isStatic ? "static" : "serve",
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
