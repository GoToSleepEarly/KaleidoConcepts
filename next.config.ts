import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许本地验收在开发服务器占用 `.next` 时使用隔离构建目录；生产默认仍为 `.next`。
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  eslint: {
    dirs: ["app", "components", "lib"],
  },
};

export default nextConfig;
