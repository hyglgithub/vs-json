import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// viewport 单独导出。App Router 会把它生成 <meta name="viewport">——**导出它会整个替换掉
// Next 的默认值**，所以下面三个都必须写全：默认那条是 width=device-width, initial-scale=1。
//
// viewportFit: 'cover' 是给刘海的：不写它，安全区（safe-area-inset-*）在 iOS 上恒为 0，
// globals.css 里那些 env() 就白写了。**它只负责让 env() 有值**，留白还得靠 CSS 那边自己加。
//
// 注意这里**没有** maximum-scale / user-scalable：那两样能顺手压掉 iOS 的聚焦缩放，
// 代价是连用户自己的双指放大也一起禁掉。缩放是刚需（要看清一段 JSON），不能为了
// 省事把它砍了——所以改成把输入框字号提到 16px 以上，见 globals.css 的手机那一段。
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

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
// **标签页上只显示 title，永远不会显示 description。** 浏览器不把 meta
// description 画进标签页——它去的是另外三个地方：搜索摘要、分享链接的预览卡片
// （Open Graph / Twitter Card）、以及浏览器书签。想让它出现在标签页上，
// 只能是把它写进 title，就是下面这么做。
//
// 标题带半句说明是有意的：title 同时是搜索结果的标题和分享卡片的标题，只写
// 「VS Json」的话，别人在任何列表里都看不出这是个什么东西。但也别再往上加——
// 标签页开满时会被截断，Google 也只显示 30 个字符出头。
const TAGLINE = '自用json格式化工具';
const TITLE = 'VS Json - ' + TAGLINE;
// 描述是标签页标题那半句的完整版：标题里放不下的「希望能帮到你」在这儿。
const DESCRIPTION = TAGLINE + '，希望能帮到你';

// 分享出去的预览必须是**绝对地址**，所以得给 metadataBase。默认值是本地开发
// 地址；CI 里由 pages.yml 传 NEXT_PUBLIC_SITE_URL。
//
// 注意 og:image 那条路**不经过 basePath**：Next 会给图标、静态资源这些走文件约定
// 的链接自动加前缀，但 Open Graph 的图片路径它原样输出。所以线上那个值必须自己
// 带上 /vs-json（pages.yml 里就是这么写的），否则分享出去图是 404。
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3112';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'VS Json',
  openGraph: {
    type: 'website',
    siteName: 'VS Json',
    title: TITLE,
    description: DESCRIPTION,
    // 预览图用界面截图而不是那个图标：分享出去时，一张能看出这是干什么的界面
    // 比一个 64px 的角标有用得多。文件在 public/，会被原样复制进产物。
    images: [{ url: '/screenshot.png', width: 1440, height: 900, alt: 'VS Json 界面' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
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
