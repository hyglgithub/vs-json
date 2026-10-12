import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// 标签页上的文字就是 title。图标不在这里写 icons 字段——app/ 下的 icon.png /
// apple-icon.png 由 App Router 的文件约定自动挂上（连带 basePath 也由它拼对）。
//
// **这里只能有一个基名为 icon 的文件。** 文件约定对每个基名只解析一个文件，按扩展名
// 优先级挑（png 排在 svg 前），所以 icon.svg 和 icon.png 并存时 SVG 会被静默丢掉——
// 文件照样复制进产物，但没有对应的 <link>，白占地方。想两种都发得用 icon0/icon1
// 那种数字后缀，但那又引入「浏览器先认哪个」的歧义。取舍是只留 PNG：
// 512×512 缩到 16px 依然清晰，而且所有浏览器都支持，不用赌。
// 矢量源文件在 docs/icon.svg。
//
// （原先只有 SVG 时，不支持 SVG favicon 的浏览器一个图标都不显示——这就是换 PNG 的原因。）
//
// 描述有**三条通道**共用它：搜索引擎摘要、分享链接的网页预览（Open Graph /
// Twitter Card）、以及浏览器书签。所以下面只写一个常量，三处引它，
// 免得改了一处忘了另一处。
const DESCRIPTION = '自用json格式化工具，希望能帮到你';

// 分享出去的预览必须是**绝对地址**，所以得给 metadataBase。默认值是本地开发
// 地址；CI 里由 pages.yml 传 NEXT_PUBLIC_SITE_URL。
//
// 注意 og:image 那条路**不经过 basePath**：Next 会给图标、静态资源这些走文件约定
// 的链接自动加前缀，但 Open Graph 的图片路径它原样输出。所以线上那个值必须自己
// 带上 /vs-json（pages.yml 里就是这么写的），否则分享出去图是 404。
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3112';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'VS Json',
  description: DESCRIPTION,
  applicationName: 'VS Json',
  openGraph: {
    type: 'website',
    siteName: 'VS Json',
    title: 'VS Json',
    description: DESCRIPTION,
    // 预览图用界面截图而不是那个图标：分享出去时，一张能看出这是干什么的界面
    // 比一个 64px 的角标有用得多。文件在 public/，会被原样复制进产物。
    images: [{ url: '/screenshot.png', width: 1440, height: 900, alt: 'VS Json 界面' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VS Json',
    description: DESCRIPTION,
    images: ['/screenshot.png'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='zh-CN'>
      <body>{children}</body>
    </html>
  );
}
