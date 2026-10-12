# Jsontool

一个单页的 JSON 查看 / 格式化工具：左边贴 JSON，右边看结构，外加一个走 SSE 的「AI 整理」。

纯前端解析，所有 JSON 处理都在浏览器里完成；只有一个接口 `/api/organize`，用来把 JSON 转给一个大模型做字段说明——不填地址就完全用不到它。

## 功能

- **格式化 / 压缩** —— 缩进 1–4 空格可选，可以顺带按键名升序 / 降序重排各层级的字段
- **树形视图** —— 逐层展开收起、全展开 / 全折叠；双击键名复制路径，双击值复制内容
- **搜索** —— 一个框同时搜树里的键值和输入框里的原文，上/下一个可按住连发
- **行号与折叠** —— 行号左侧的三角把整块收成一行；行号可关，三角留着
- **Unicode / 转义** —— 中文 ↔ `\uXXXX`，以及整篇的反斜杠转义与还原
- **保存记录** —— 手动把当前内容存下来（最多 60 条 / 2.0 MB），点条目载回编辑框
- **上传 / 下载 / 复制** —— 下载文件名带时间戳，窗口任意位置可拖入 `.json`
- **AI 整理** —— 流式返回概要、结构、字段含义、可疑字段、重排建议
- **设置** —— 缩进、Key 排序、字体大小（12–20px）、行号，以及一键恢复默认

界面里的「帮助」面板、两个空态和示例 JSON 都讲这些功能怎么用，文案统一出自 `lib/help.ts`。

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
  page.tsx              五行，只渲染 <JsonTool />
  globals.css           全部样式（原生 CSS + 自定义属性，没有 Tailwind / CSS Modules）
  api/organize/route.ts 唯一的接口：转发给 DeepSeek 兼容服务，回吐 SSE
components/
  JsonTool.tsx          唯一的 "use client" 模块，交互全在这里
lib/                    纯函数，不含 React、不含组件状态
  constants.ts          NL/BS 常量、toast 参数、HIST_*、SAMPLE
  json.ts               isObject / joinKey / deepSort / findMatches / foldRanges ...
  text.ts               escapeUnicode / unescapeUnicode、escapeText / unescapeText、reformatJson
  format.ts             fmtTime / fmtRel / fmtBytes / fmtFileStamp / histPreview
  help.ts               帮助与教程文案的**唯一来源**
types/assets.d.ts       *.css 的环境声明
```

拆分的界线是「这个函数需不需要看到某个 `useState`」——需要就留在 `JsonTool.tsx`，不需要才进 `lib/`。

## AI 整理怎么配

1. 打开右侧「设置」面板，填 **AI 服务地址**（默认 `http://120.77.200.18:8787`，是一个 DeepSeek 兼容服务）和 **访问密钥**。
2. 切到「AI 整理」，点「开始分析」。

两项配置存在**这台机器的浏览器**里（`localStorage["jsontool.ai"]`），密钥随请求一起发给本地服务端再转发，服务端不保存。不填就走环境变量 `DEEPSEEK_API_KEY` / `DEEPSEEK_ENDPOINT`，都没有才用上面那个默认地址。

## 数据存在哪

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 保存记录 | `localStorage["jsontool.history"]` | **键名不能改**，改了等于把已存的条目全部丢弃 |
| AI 地址与密钥 | `localStorage["jsontool.ai"]` | |
| 缩进 / Key 排序 / 字体大小 / 行号 | 只在内存里 | 刷新即回默认值 |

## 已知边界

都是有意设的上限，不是没做：

- **5 MB** —— 超过就只留格式化和压缩，树形视图与 AI 停用
- **20000 行** —— 超过不画行号槽（折叠三角一起停），节点数随行数线性增长
- **120000 字符** —— AI 请求的输入上限，超出截断并注明
- **60 条 / 2 MB** —— 保存记录的两个上限相互独立，大文档先撞字节额度

## 另外

`e2e.cjs` 是台机器专用的 CDP 脚本，不是测试套件：它从硬编码的绝对路径引 `ws`、拉硬编码路径下的 Chrome，并靠**中文按钮文字**（`格式化`、`压缩`…）和 `.actions` / `.editor-front` 这两个类名定位元素。改按钮文字或这两个类名会悄悄把它弄坏。

`dev.log` 是一份抓下来的开发服务器日志，不是配置。里面提到的 `/api/fetch-json` 早就不存在了。
