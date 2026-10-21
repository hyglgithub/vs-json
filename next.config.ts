import type { NextConfig } from 'next';

// 部署走 Vercel 的 Git 集成：push 到 main 后由 Vercel 执行标准 `next build`。
// 之前那套 GitHub Pages 的静态导出（GITHUB_PAGES=1 → output: 'export' + basePath）
// 随 pages.yml 一起删掉了，这里不再需要任何条件配置。
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
