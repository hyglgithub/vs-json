import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// 站点名。标签页上显示的就是 title —— 图标由同目录的 icon.svg 走文件约定自动挂上，
// 不需要在这里写 icons 字段。
export const metadata: Metadata = {
  title: 'VS Json',
  description: '纯前端的 JSON 查看 / 格式化工具：左边贴 JSON，右边看结构。不联网、无后端。',
  applicationName: 'VS Json',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='zh-CN'>
      <body>{children}</body>
    </html>
  );
}
