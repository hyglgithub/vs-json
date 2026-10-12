import type { NextConfig } from 'next';

// GitHub Pages 的构建开关。**只在 CI 里为真**（见 .github/workflows/pages.yml 的
// GITHUB_PAGES=1），本地 `npm run dev` 和 `npm run build` 一律不受影响。
//
// 为什么非得是条件式的：Pages 的项目站点挂在 https://<用户>.github.io/<仓库名>/
// 这层子路径下，资源 URL 不带 /vs-json 前缀就全部 404——表现是页面骨架出来了、
// 然后白屏，控制台一堆 404。但这个前缀一旦写死，本地开发也会变成
// localhost:3112/vs-json/，README、e2e.cjs、CLAUDE.md 里所有地址都得跟着改，
// 仓库改名那天还要再改一遍。用一个环境变量把它关在 CI 里，两边都干净。
const forPages = process.env.GITHUB_PAGES === '1';

// output 的取值是字面量联合类型（'export' | 'standalone' | undefined），
// 直接写在展开里会被推成 string 而报错，所以先落在一个带 NextConfig 标注的常量上。
const pagesOnly: NextConfig = { output: 'export', basePath: '/vs-json' };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(forPages ? pagesOnly : {}),
};

export default nextConfig;
