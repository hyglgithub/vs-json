"use client";
import dynamic from "next/dynamic";

// **纯客户端渲染（ssr: false），这是有意的，别去掉。**
//
// 用户偏好（分栏比例、字号、行号、缩进、Key 排序）存在 localStorage 里，只有浏览器
// 才知道。照常做服务端渲染的话，送出去的 HTML 里一定带**默认值**：浏览器先按默认值
// 画一帧，等 React 跑起来读到存的值再改一遍——拖过分栏、或把行号打开过的人，会看到
// 面板边缘和整块正文跳一下。
//
// 关掉 SSR 之后，React 在**第一次渲染之前**就读到了存的值（见 JsonTool 里
// `useState(loadPrefs)` 那句），第一帧画出来就是对的，压根没有「错的那一帧」。
//
// 代价是首屏要等一小会儿 JS。看到的是深色背景——body 的背景和其余 CSS 仍然随
// 服务端送出的样式表提前到位，所以不会白屏，也不像坏了。
// 本项目没有 SEO 需求，页面本身也只有这一个组件，这笔交换是划算的。
//
// 顺带一提：在 `<head>` 里塞内联脚本那种常规做法在这里行不通——服务端渲染出来的
// HTML 带的是**内联样式**（`style="width:33%"`、`--editor-font:15px`），而内联样式
// 优先级高于 :root 上的变量，脚本改不动它。
const JsonTool = dynamic(() => import("../components/JsonTool"), { ssr: false });

export default function Page() {
  return <JsonTool />;
}
