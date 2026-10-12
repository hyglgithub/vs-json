# Jsontool

一个单页的 JSON 查看 / 格式化工具：左边贴 JSON，右边看结构。

**纯前端，没有后端**。所有 JSON 处理都在浏览器里完成，不联网、没有接口、不往任何地方发数据。

## 功能

- **格式化 / 压缩** —— 格式化时缩进 1–4 空格可选；两者都能顺带按键名升序 / 降序重排各层级的字段
- **树形视图** —— 逐层展开收起、全展开 / 全折叠；双击键名复制路径，双击值复制内容
- **搜索** —— 一个框同时搜树里的键值和输入框里的原文，上/下一个可按住连发
- **行号与折叠** —— 行号左侧的三角把整块收成一行；行号可关，三角留着
- **Unicode / 转义** —— 中文 ↔ `\uXXXX`，以及整篇的反斜杠转义与还原
- **保存记录** —— 手动把当前内容存下来（最多 60 条 / 2 MB），点条目载回编辑框
- **上传 / 下载 / 复制** —— 下载文件名带时间戳，窗口任意位置可拖入 `.json`
- **设置** —— 缩进、Key 排序、字体大小（12–20px）、行号、分栏宽度，以及一键恢复默认

教程有三处：**「帮助」面板**是完整手册，**三个空白面板**各一句话指路，**点「示例」载入的那份 JSON 本身就是教程**（十条，一条一个功能）。前两处的文案出自 `lib/help.ts`。

## 快速开始

```bash
npm install
npx next dev -p 3112
```

然后打开 <http://localhost:3112/>。

> **端口写死 3112 是有原因的**：`e2e.cjs` 和留下的 `dev.log` 都按 3112 连。`npm run dev` 没有 `-p` 参数，会跑到 3000 上去。

## 命令

```bash
npm run dev         # next dev（没有 -p，见上）
npm run build       # next build
npm run start       # next start
npm run typecheck   # tsc --noEmit —— 本项目唯一的静态检查
```

项目里**没有**测试框架、没有 ESLint、没有 Prettier。`npm run typecheck` 就是全部质量闸门。

> 跑 `npm run build` 之前先把 `next dev` 停掉。两者共用 `.next/`，同时跑会让 dev server 500（`Cannot find module './887.js'`）。构建完记得 `rm -rf .next` 再重启 dev。

## 目录结构

```
app/
  layout.tsx            服务端组件，设 metadata 并引入 globals.css
  page.tsx              纯客户端渲染（dynamic + ssr:false），只渲染 <JsonTool />
  globals.css           全部样式（原生 CSS + 自定义属性，没有 Tailwind / CSS Modules）
components/
  JsonTool.tsx          唯一的交互模块，交互全在这里
lib/                    纯函数，不含 React、不含组件状态
  prefs.ts              偏好：PREFS_KEY、默认值、可选项清单、校验与夹取
  constants.ts          NL/BS 常量、toast 参数、HIST_*、SAMPLE
  json.ts               isObject / joinKey / deepSort / findMatches / foldRanges ...
  text.ts               escapeUnicode / unescapeUnicode、escapeText / unescapeText、reformatJson
  format.ts             fmtTime / fmtRel / fmtBytes / fmtFileStamp / histPreview
  help.ts               帮助与教程文案
types/assets.d.ts       *.css 的环境声明
```

拆分的界线是「这个函数需不需要看到某个 `useState`」——需要就留在 `JsonTool.tsx`，不需要才进 `lib/`。

`page.tsx` 关掉了服务端渲染，这是有意的：偏好存在 localStorage 里，只有浏览器才知道。照常服务端渲染的话，送出去的 HTML 一定带默认值，浏览器会先按默认值画一帧再跳到存的值——拖过分栏的人会看到面板边缘跳一下。关掉之后 React 在第一次渲染之前就读到了存的值，第一帧就是对的。代价是首屏要等一小会儿 JS（看到的是深色背景，不会白屏）。

## 数据存在哪

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 保存记录 | `localStorage["jsontool.history"]` | **键名不能改**，改了等于把已存的条目全部丢弃 |
| 缩进 / Key 排序 / 字体大小 / 行号 / 分栏比例 | `localStorage["jsontool.prefs"]` | 带版本号；存的格式对不上就整袋丢掉、回到默认值 |

**不存**的两样：右侧当前开着哪个面板（那是「我此刻在干什么」，不是偏好，每次打开都回到树形视图）、输入框里的内容（不自动恢复草稿，和「点保存才保存」是同一条规矩）。

默认值：分栏 **左右 2:1**、行号 **关闭**（折叠三角仍在）、缩进 2 空格、字号 15px、Key 排序关闭。设置面板右上角的「恢复默认」把这五项一起重置。

## 已知边界

都是有意设的上限，不是没做：

- **5 MB** —— 超过就只留格式化和压缩，树形视图停用
- **20000 行** —— 超过不画行号槽（折叠三角一起停），节点数随行数线性增长
- **60 条 / 2 MB** —— 保存记录的两个上限相互独立，大文档先撞字节额度

## 另外

`e2e.cjs` 是台机器专用的 CDP 脚本，不是测试套件：它从硬编码的绝对路径引 `ws`、拉硬编码路径下的 Chrome，并靠**中文按钮文字**（`格式化`、`压缩`…）和 `.actions` / `.editor-front` 这两个类名定位元素。改按钮文字或这两个类名会悄悄把它弄坏。

`dev.log` 是一份抓下来的开发服务器日志，不是配置。里面提到的 `/api/fetch-json` 早就不存在了。
