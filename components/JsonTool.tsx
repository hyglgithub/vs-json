"use client";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, DragEvent, ReactNode } from "react";


import { BS, HIST_KEY, HIST_MAX, HIST_MAX_CHARS, NL1, SAMPLE, TOAST_MAX, TOAST_MS, TOAST_OUT_MS } from "../lib/constants";
import type { HistoryEntry, ToastKind } from "../lib/constants";
import { collectPaths, computeStats, deepSort, findMatches, foldRanges, isObject, joinKey } from "../lib/json";
import type { FoldRange, JsonValue, Match } from "../lib/json";
import { escapeText, escapeUnicode, reformatJson, unescapeText, unescapeUnicode } from "../lib/text";
import { DRAFT_MAX_CHARS, DRAFT_WRITE_MS, loadDraft, saveDraft } from "../lib/draft";
import { fmtBytes, fmtFileStamp } from "../lib/format";
import { clampSide, loadPrefs, PREFS_WRITE_MS, savePrefs, SETTINGS_DEFAULTS } from "../lib/prefs";
import type { PanelId, Prefs, RightPanel, SortMode } from "../lib/prefs";
import Editor from "./Editor";
import Toasts from "./Toasts";
import type { Toast } from "./Toasts";
import HelpPanel from "./panels/HelpPanel";
import HistoryPanel from "./panels/HistoryPanel";
import SettingsPanel from "./panels/SettingsPanel";
import TreePanel from "./panels/TreePanel";

// 行号层要不要渲染的阈值。行号是**按逻辑行**渲染的（见 .editor-nums 的注释），
// 一个逻辑行一个 <div>，所以行数直接等于 DOM 节点数。超过这个数就不画行号了：
// 输入框本身仍然正常，只是左边没有号码。别把它当成"性能优化"删掉。
const LINE_NUM_MAX = 20000;

// 「窄窗口」的分界，**必须和 globals.css 里那条 `@media (max-width: 900px)` 一致**。
// CSS 在那条里把 .main 翻成网格、让右侧面板盖住正文；JS 这边只用它决定开局要不要
// 展开面板（见 rightPanel 的初值）。两边对不上，表现是开局面板盖住正文、或者反过来。
const NARROW_MQ = "(max-width: 900px)";

// 设置的默认值、可选项清单、存取逻辑都在 lib/prefs.ts —— 那里是唯一碰
// localStorage["jsontool.prefs"] 的地方。这里只负责把它们接进组件状态。

// 右侧面板的 id（PanelId / RightPanel）定义在 lib/prefs.ts：它们同时是注册表里的键、
// 活动栏按钮的顺序、以及偏好的取值，而偏好那边的存量校验必须按同一份清单认值。

export default function JsonTool() {
  // 偏好快照，**只读一次**，给下面几个 useState 当初值。
  // 页面是**纯客户端渲染**的（page.tsx 里的 ssr:false），所以这份快照就是第一帧
  // 画出来的东西——不会出现「先按默认值画一帧、等 React 跑起来再跳一下」。
  // 这也是当初选纯客户端渲染的全部理由，别把 ssr:false 去掉。
  const [prefs] = useState(loadPrefs);
  // 输入框正文。初值是**上次离开时的那一串**（lib/draft.ts），和 loadPrefs 一样是
  // 惰性初始化——所以第一帧画出来就已经是恢复后的内容，不会先闪一帧空编辑器。
  // 这正是 app/page.tsx 关掉 SSR 换来的东西：**别改成在 effect 里补一次 setRaw**。
  const [raw, setRaw] = useState(loadDraft);
  const [indent, setIndent] = useState(prefs.indent);
  // 编辑器字号。只作用于左侧输入框（含行号），不影响右侧树和面板——
  // 这是代码编辑器里「字体大小」的通常含义。默认 15 对齐 body 的 font。
  const [fontSize, setFontSize] = useState(prefs.fontSize);
  // 行号槽（号码 + 折叠三角）是否显示，设置面板可开。默认关闭。
  const [showLineNums, setShowLineNums] = useState(prefs.showLineNums);
  // 已折叠的块，存的是**开括号所在的行号**（0 起）。折叠期间编辑器整体转只读展示，见 folding。
  const [folded, setFolded] = useState<Set<number>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>(prefs.sortMode);
  const [openMenu, setOpenMenu] = useState<"unicode" | "escape" | null>(null);
  const [menuLocked, setMenuLocked] = useState(false);
  // 当前这个下拉是不是要往左展开（贴着按钮右边缘）。见下面的 useLayoutEffect。
  const [menuFlip, setMenuFlip] = useState(false);
  const toggleMenu = (id: "unicode" | "escape") => {
    if (openMenu === id && menuLocked) {
      setOpenMenu(null);
      setMenuLocked(false);
    } else {
      setOpenMenu(id);
      setMenuLocked(true);
    }
  };
  useEffect(() => {
    if (!menuLocked) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest(".menu-wrap")) {
        setOpenMenu(null);
        setMenuLocked(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuLocked]);

  // 工具栏下拉默认从按钮左边缘**往右**展开，可 .pane 是 overflow:hidden——
  // 按钮离窗格右边不足一个菜单宽时，菜单就伸出去被切掉（实测 390px 下 Unicode 菜单
  // 超出窗格 37px、超出窗口 34px）。放不下就翻成右对齐，贴着按钮右边缘往左展开。
  // 翻过去之后菜单右边缘正好落在按钮右边缘上，而按钮在窗格内，所以必然放得下，
  // 不会来回翻；依赖只有 openMenu，也就不会再跑一轮。
  // **useLayoutEffect 而不是 useEffect**：它跑在绘制之前，「先画在右边、再跳到左边」
  // 那一帧不会出现在屏幕上（设置面板的下拉翻转用的是同一条理由）。
  useLayoutEffect(() => {
    if (!openMenu) return;
    const wrap = menuWrapRefs.current.get(openMenu);
    const menu = wrap && wrap.querySelector(".menu");
    const pane = wrap && wrap.closest(".pane");
    if (!menu || !pane) return;
    setMenuFlip(menu.getBoundingClientRect().right > pane.getBoundingClientRect().right - 8);
  }, [openMenu]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["$"]));
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // 标识符一律叫 history / hist*，界面上一律叫「保存记录」——对不上是故意的：
  // 它原来叫「历史记录」，改名只改了用户可见的部分。而 localStorage 的键
  // jsontool.history **不能跟着改**，改了等于把已存下的条目全部丢弃，
  // 所以常量名跟着键走，不去制造「常量叫 SAVED_KEY、值却是 jsontool.history」那种别扭。
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  // 右侧收起没、展开哪一项，**是偏好的一项、会落盘**，所以初值来自存下来的那份：
  // 下次打开时还是你上次离开的样子。默认 "tree"。
  // 它在 SETTINGS_DEFAULTS 里，但「恢复默认」**不**把它写回去——那个按钮就长在设置面板里，
  // 一按就换面板等于把自己脚下那块地抽走。理由写在 lib/prefs.ts 那一段。
  // 窄窗口下面板是**覆盖式**的（整块盖住正文），所以开局一律不展开：
  // 一进来就是一整屏树形视图、编辑器一个字都看不见，比"没记住上次开哪个"糟糕得多。
  // 宽窗口照旧记忆——那边面板和正文并排，开着不挡事，记忆才有意义。
  // 这个断点必须和 globals.css 里那条 `@media (max-width: 900px)` 一致。
  const [rightPanel, setRightPanel] = useState<RightPanel>(() =>
    window.matchMedia(NARROW_MQ).matches ? "none" : prefs.rightPanel);
  // 右侧面板宽度（百分比）。默认来自 SETTINGS_DEFAULTS = 左右 2:1。
  // **只有宽窗口需要它**：窄窗口下没有分栏，面板是覆盖式的。
  const [sideWidth, setSideWidth] = useState(prefs.sideWidth);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const backRef = useRef<HTMLPreElement | null>(null);
  const marksRef = useRef<HTMLPreElement | null>(null);
  // 行号层。它自己也是 overflow:hidden 的滚动容器，靠直接赋 scrollTop 跟 textarea 对齐，
  // 和 .editor-back 是同一套办法。横向不跟——行号要钉在左槽里，不能跟着横向滚走。
  const numsRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  // 两个工具栏下拉的 .menu-wrap，给下面那个「往右放不下就翻到左边」的 effect 量尺寸用。
  const menuWrapRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const histIdRef = useRef(0);
  // 草稿落盘用的三个 ref，见下面那段 effect。draftWrittenRef 的初值就是刚读出来的
  // 那一串，于是挂载后第一次 effect 不会把同一份内容白写一遍。
  const draftRef = useRef(raw);
  const draftWrittenRef = useRef(raw);
  const draftWarnedRef = useRef(false);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef<Map<number, number>>(new Map());
  // 退场计时器。键存在 == 这条已经在摘除队列里了，用它代替单独的「已标记」集合。
  const outTimersRef = useRef<Map<number, number>>(new Map());
  // 「上一个 / 下一个」长按连发用的三个计时器/长度
  const navLenRef = useRef(0);
  const repeatDelayRef = useRef<number | null>(null);
  const repeatTickRef = useRef<number | null>(null);

  // 分隔条只在宽窗口存在（窄窗口下面板是覆盖式的，见 globals.css 的 ≤900px 那段），
  // 所以这里只有横着一个方向：分隔条在正文**右边**，往左拖 = 面板变宽。
  const onSplitDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: sideWidth };
  };
  const onSplitMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const deltaPct = ((d.startX - e.clientX) / window.innerWidth) * 100;
    // 夹取走 lib/prefs 的 clampSide，和「读存量时」用的是同一个范围，不会两处不一致
    setSideWidth(clampSide(d.startW + deltaPct));
  };
  const onSplitUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // 偏好变了就写回 localStorage。
  // **防抖是必须的，不是优化**：拖 splitter 时 sideWidth 每帧都在变，一次拖动能触发
  // 一两百次 setItem，而 localStorage 是同步 IO，不防抖拖起来会明显发顿。
  // 依赖是下面拼出来的那个对象——任何一项变了引用就变，effect 自然重跑；
  // 也可以理解成「这六项就是一个整体，落盘时就该一起落」。
  // rightPanel 也在里面：点一下活动栏就改一次引用，防抖之后落一次盘，代价极小。
  const prefsNow = useMemo((): Prefs => ({ indent, fontSize, showLineNums, sortMode, sideWidth, rightPanel }),
    [indent, fontSize, showLineNums, sortMode, sideWidth, rightPanel]);
  useEffect(() => {
    const t = window.setTimeout(() => savePrefs(prefsNow), PREFS_WRITE_MS);
    return () => window.clearTimeout(t);
  }, [prefsNow]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HIST_KEY);
      if (!saved) return;
      const arr = JSON.parse(saved) as HistoryEntry[];
      if (!Array.isArray(arr)) return;
      const clean = arr
        .filter((h) => h && typeof h.text === "string" && typeof h.ts === "number")
        .map((h, i) => ({ id: typeof h.id === "number" && h.id > 0 ? h.id : i + 1, ts: h.ts, text: h.text }));
      setHistory(clean);
      histIdRef.current = clean.reduce((m, h) => Math.max(m, h.id), 0);
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(HIST_KEY, JSON.stringify(history));
    } catch {
    }
  }, [history]);

  const parsed = useMemo(() => {
    const trimmed = raw.trim();
    if (!trimmed) return { value: null as JsonValue, error: "", empty: true };
    try {
      return { value: JSON.parse(trimmed) as JsonValue, error: "", empty: false };
    } catch (err) {
      return { value: null as JsonValue, error: err instanceof Error ? err.message : String(err), empty: false };
    }
  }, [raw]);

  const tooBig = raw.length > 5 * 1024 * 1024;
  const ready = !parsed.empty && !parsed.error;

  // 行号按 \n 切成逻辑行：折行的续行**不编号**，所以号码和 JSON 的逻辑行严格一一对应。
  // 能做到这点，靠的是 .editor-nums 与 .editor-back 的盒子尺寸、字体、换行规则完全一致——
  // 某个逻辑行在编辑器里占几行，行号层里那个块就占几行高，下一个号码自然落在下一个行首。
  const lines = useMemo(() => raw.split(NL1), [raw]);
  const gutterOn = showLineNums && lines.length <= LINE_NUM_MAX;
  // 可折叠块。超大文档直接跳过——它是每键一次的全量扫描，和 JSON.parse 同一个量级。
  const ranges = useMemo(() => (tooBig ? new Map<number, FoldRange>() : foldRanges(raw)), [raw, tooBig]);
  // 真正被藏起来的物理行：**含闭括号行**。整块收成一行——开口行保留，闭括号连同它后面的
  // 逗号被接到开口行末尾，所以 `"tags": [` / 两项 / `],` 折起来就是一行 `"tags": […],`。
  const hidden = useMemo(() => {
    const h = new Set<number>();
    folded.forEach((open) => {
      const r = ranges.get(open);
      if (!r) return;
      for (let i = open + 1; i <= r.closeLine; i++) h.add(i);
    });
    return h;
  }, [folded, ranges]);
  // folding = 真的有行被藏起来了。光 folded 非空不够：块被编辑掉之后 folded 里可能留着死键。
  const folding = hidden.size > 0;
  // 折叠后每一行显示什么。折起来那行 = 本行 + … + 闭括号行**从闭括号起**的那一段，
  // 用 closeCol 切而不是整行照抄：闭括号行可能是 `  }],` 这种一个块收好几层的情况，
  // 整行抄会把别的块的括号也带过来。
  // **必须只有这一份**：.editor-back 用它拼整串，.editor-nums 逐行渲染，同源才不会换行分叉。
  const shown = useMemo(() => {
    if (!folding) return lines.map((text, i) => ({ i, text }));
    const out: { i: number; text: string }[] = [];
    lines.forEach((l, i) => {
      if (hidden.has(i)) return;
      const r = folded.has(i) ? ranges.get(i) : undefined;
      out.push({ i, text: r ? l + "…" + (lines[r.closeLine] || "").slice(r.closeCol) : l });
    });
    return out;
  }, [lines, hidden, folded, folding, ranges]);
  const foldedText = useMemo(() => (folding ? shown.map((s) => s.text).join(NL1) : raw), [shown, folding, raw]);
  // 行号槽宽。数字列按最大行号的位数算（两位起步，不然只有 9 行时槽口会贴住正文）；
  // 折叠列固定 14px，**有没有折叠点的行都留着**，三角才不会左右跳。
  // 用 ch 不用 px：字号可调，ch 会跟着 --editor-font 一起缩放。
  // 列宽 = 最大行号的**实际位数**，不再 Math.max(2, …) 兜底两位。
  // 那个下限是早先留白很宽（20px）时加的，现在常数收到 4px，它只会白白多留一个字符宽——
  // 7 行的文档所有号码都是 1 位数，却按 2 位留槽，实测左边距从 6px 变成 14.2px。
  const numCh = gutterOn ? String(lines.length).length : 0;
  // 折叠列**不看 showLineNums**：关掉行号只是不显示号码，三角要留着，否则就没法折叠了。
  // 两层共用 .editor-nums 这一层 DOM，所以行数上限对两者一起生效（代价都在那层的节点数上）。
  const foldCol = ranges.size > 0 && lines.length <= LINE_NUM_MAX;
  const gutterShown = gutterOn || foldCol;
  const editorStyle = {
    "--editor-font": fontSize + "px",
    "--num-ch": String(numCh),
    "--fold-w": foldCol ? "14px" : "0px",
    // 槽整个关掉时必须显式给 0，否则 CSS 里那条 calc 会留下死宽度。
    // 末尾那个常数：行号左边缘到编辑器左边 = 常数 + 2（因为下面 .num 的 right 偏移是 fold-w + 8）。
    // 一路收紧过来：20px（太宽，比数字本体还宽）→ 12px → 现在 6px。
    "--gutter": gutterShown ? "calc(var(--num-ch) * 1ch + var(--fold-w) + 4px)" : "0px",
  } as CSSProperties;

  // 折叠位置是**按行号**记的，正文一变行号就可能整体错位，所以直接全丢。
  // 返回同一个引用时 React 会跳过这次更新，所以每敲一个字并不会多渲染一次。
  useEffect(() => { setFolded((f) => (f.size ? new Set<number>() : f)); }, [raw]);

  // 整篇替换正文的统一入口：清折叠 + 换正文，放在**同一个批次**里。
  // 不能只靠上面那个 [raw] effect：
  //   1) 内容本来就是目标形态时（对着已格式化的文本再点格式化、已压缩的再点压缩），
  //      setRaw 收到的是同一个字符串，React 跳过更新，effect 根本不跑，折叠会原地留着；
  //   2) effect 在渲染之后才跑，会先拿「旧的 folded + 新的 ranges」渲染一帧，
  //      屏幕上闪一次错误的折叠。和 setRaw 同批更新就没有这一帧。
  // 格式化 / 压缩 / Unicode / 转义 / 示例 / 清空 / 上传 / 拖入 / 记录恢复 全走这里。
  const replaceAll = (t: string) => { setFolded(new Set<number>()); setRaw(t); };

  // 搜索相关的一律展开。折叠期间命中标记是**不画**的（偏移按 raw 算，折叠后行号已重排），
  // 于是搜索在折叠态下是完全死的：计数器照跳，屏幕上不出黄块，
  // 点「下一个」也不动——它靠 querySelector('.mark.active') 定位，而那一层是空的。
  // 与其在折叠态里再维护一套「折叠后」的偏移，不如直接展开：搜索本来就是要看结果。
  // 已经是空的就返回同一个引用，React 跳过更新，所以无脑调用不额外渲染。
  const unfold = useCallback(() => { setFolded((f) => (f.size ? new Set<number>() : f)); }, []);

  const toggleFold = (line: number) => {
    // 折叠期间 textarea 是 visibility:hidden，先把焦点交出去——
    // 否则光标还留在里面，接着打字就改到看不见的地方去了。
    editorRef.current?.blur();
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line); else next.add(line);
      return next;
    });
  };

  // 折叠期间 .editor-nums 变成滚动驱动（textarea 那时不可交互），把它的位置推给另外两层。
  // 依赖 folding 而不是每次渲染：平时是 textarea 推 nums，反过来推会打架。
  useEffect(() => {
    const nm = numsRef.current;
    if (!nm) return;
    const st = nm.scrollTop;
    const bk = backRef.current;
    if (bk) { bk.scrollTop = st; bk.scrollLeft = 0; }
    const mk = marksRef.current;
    if (mk) mk.scrollTop = st;
  }, [folding]);
  const info = useMemo(() => (ready ? computeStats(parsed.value) : { nodes: 0, depth: 0 }), [ready, parsed.value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !ready) return [] as Match[];
    const acc: Match[] = [];
    findMatches(parsed.value, q, "$", [], acc, 500);
    return acc;
  }, [query, ready, parsed.value]);

  const textMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as number[];
    const lower = raw.toLowerCase();
    const out: number[] = [];
    let idx = lower.indexOf(q, 0);
    while (idx !== -1 && out.length < 500) {
      out.push(idx);
      idx = lower.indexOf(q, idx + q.length);
    }
    return out;
  }, [query, raw]);

  const nav = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: Array<{ tree: Match | null; offset: number; len: number }> = [];
    let cursor = 0;
    for (const m of matches) {
      let start = raw.indexOf(m.literal, cursor);
      if (start === -1) start = raw.indexOf(m.literal);
      if (start !== -1) cursor = start + m.literal.length;
      if (start === -1) {
        items.push({ tree: m, offset: -1, len: q.length });
        continue;
      }
      const seg = raw.slice(start, start + m.literal.length).toLowerCase();
      let inner = seg.indexOf(q, 0);
      if (inner === -1) {
        items.push({ tree: m, offset: start, len: q.length });
        continue;
      }
      while (inner !== -1) {
        items.push({ tree: m, offset: start + inner, len: q.length });
        inner = seg.indexOf(q, inner + q.length);
      }
    }
    const covered = (o: number) => items.some((it) => it.offset !== -1 && o >= it.offset && o < it.offset + it.len);
    for (const o of textMatches) {
      if (covered(o)) continue;
      items.push({ tree: null, offset: o, len: q.length });
    }
    items.sort((a, b) => {
      const ao = a.offset === -1 ? Number.MAX_SAFE_INTEGER : a.offset;
      const bo = b.offset === -1 ? Number.MAX_SAFE_INTEGER : b.offset;
      return ao - bo;
    });
    return items;
  }, [matches, textMatches, raw, query]);

  const qlen = query.trim().length;
  const activeOffset = nav.length ? nav[Math.min(activeIndex, nav.length - 1)].offset : -1;
  // 只产出搜索命中的 <mark>，不掺任何选区状态——选区交给 textarea 原生绘制（零 JS、不触发重渲染）。
  // 这一层渲染在 textarea 之上，所以黄色标记盖在蓝色选区之上，不会被压暗。
  const highlightRaw = useMemo(() => {
    if (!qlen) return raw;
    const nodes: ReactNode[] = [];
    let i = 0;
    for (const o of textMatches) {
      if (o > i) nodes.push(raw.slice(i, o));
      nodes.push(<mark className={"mark" + (o === activeOffset ? " active" : "")} key={o}>{raw.slice(o, o + qlen)}</mark>);
      i = o + qlen;
    }
    nodes.push(raw.slice(i));
    return nodes;
  }, [raw, textMatches, qlen, activeOffset]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (nav.length === 0) return;
    const item = nav[Math.min(activeIndex, nav.length - 1)];
    if (!item.tree) return;
    const target = item.tree;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add("$");
      for (const a of target.ancestors) next.add(a);
      return next;
    });
  }, [activeIndex, nav]);

  useEffect(() => {
    if (nav.length === 0) return;
    const item = nav[Math.min(activeIndex, nav.length - 1)];
    const timer = window.setTimeout(() => {
      if (item.tree) {
        const el = rowRefs.current.get(item.tree.path);
        if (el) el.scrollIntoView({ block: "center" });
      }
      // 搜索只滚动，**不选中、不夺焦点**。
      // 以前这里会 setSelectionRange + focus，于是每次点「下一个」都在编辑器里留下一块蓝色选区、
      // 把光标塞进 textarea 并抢走搜索框的焦点——用户看到的「蓝色光标」就是它，而且位置还常和预期对不上。
      // 现在：当前命中项只靠 .mark.active 那圈描边标识；蓝色只在用户自己拖选时才由浏览器原生绘制。
      const ed = editorRef.current;
      // 命中标记渲染在 .editor-marks 层（不是 .editor-back），必须去那一层找
      const mk = marksRef.current;
      if (ed && mk) {
        const mark = mk.querySelector(".mark.active");
        if (mark instanceof HTMLElement) {
          ed.scrollTop = Math.max(0, mark.offsetTop - ed.clientHeight / 2);
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeIndex, nav, expanded]);

  // ---- 消息提示（全项目通用）----
  // 所有「做完了给个回音」的反馈一律走 notify()，不要再给单个功能写临时状态。
  // 原来散着的四套（copied / saved / restoredId / JsonNode 的 flash）已经全并进来了。
  // 只做「标记为退场」这一件纯状态变更。真正的摘除由下面那个 effect 统一负责，
  // 于是「到期」「点 ×」「被上限挤掉」三条路走的是同一套下落动画。
  const dropToast = useCallback((id: number) => {
    const timer = toastTimersRef.current.get(id);
    if (timer !== undefined) { window.clearTimeout(timer); toastTimersRef.current.delete(id); }
    setToasts((prev) => {
      const hit = prev.find((t) => t.id === id);
      if (!hit || hit.leaving) return prev; // 已经在退场了，别重复触发
      return prev.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    });
  }, []);

  // 退场动画播完就摘掉。计时器记在 ref 里、不 return cleanup：
  // effect 的 cleanup 在 toasts 每次变化时都会跑，而「来了一条新消息」正是一次变化，
  // 那样会把还没到点的摘除给取消掉，消息就永远留在屏幕上了。
  useEffect(() => {
    toasts.forEach((t) => {
      if (!t.leaving || outTimersRef.current.has(t.id)) return;
      outTimersRef.current.set(t.id, window.setTimeout(() => {
        outTimersRef.current.delete(t.id);
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, TOAST_OUT_MS));
    });
  }, [toasts]);

  // id 和计时器都在 setState updater **之外**创建：StrictMode 会双调 updater，
  // 把副作用写进去就会重复计时（本项目在 pushHistory 上踩过同一个坑）。
  // 每次调用都新增一条，**不做任何去重**：同一条消息连点多次就叠多条——
  // 点了几下就该有几下的反馈。之前这里会把同文本的消息合并成一条并把计时器延后，
  // 结果连点同一个按钮屏幕上只有一条，看着像没反应。
  const notify = useCallback((text: string, kind: ToastKind = "primary") => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => {
      const next = [...prev, { id, text, kind, leaving: false }];
      // 活跃条数超过上限时，把最旧的活跃条目标成退场，让它播完下落动画再被摘掉。
      // 以前这里是 slice(-TOAST_MAX)：直接把最旧的从数组里切掉，元素瞬间消失、
      // 没有任何下落动作——正是「消息满了之后，老消息应该有个下落动作」要修的那点。
      // 只标记、不摘除，所以这里依旧是纯函数，可以安全地被 StrictMode 双调。
      let keep = TOAST_MAX;
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].leaving) continue; // 已在退场的条目不算名额
        if (keep > 0) { keep -= 1; continue; }
        next[i] = { ...next[i], leaving: true };
      }
      return next;
    });
    toastTimersRef.current.set(id, window.setTimeout(() => dropToast(id), TOAST_MS));
  }, [dropToast]);

  useEffect(() => () => {
    toastTimersRef.current.forEach((t) => window.clearTimeout(t));
    toastTimersRef.current.clear();
    outTimersRef.current.forEach((t) => window.clearTimeout(t));
    outTimersRef.current.clear();
  }, []);

  // ---- 草稿落盘（输入框正文）----
  // **和「保存记录」不是一回事，别把 pushHistory 挪到这儿来**：那边只有点「保存」才写，
  // 而且是一份可增删的列表；这边是「编辑器上次离开时的样子」，只有一个槽位、覆盖式，
  // 跟着输入自动更新。两者只是都往 localStorage 写而已。
  //
  // 先比一遍再写：兜底那一侧（pagehide / visibilitychange）会被反复触发，不比较的话
  // 每次切标签都要把整篇正文重写一次。
  const flushDraft = useCallback(() => {
    const t = draftRef.current;
    if (t === draftWrittenRef.current) return;
    if (t.length > DRAFT_MAX_CHARS) return; // 超上限不写，提示在下面那条 effect 里给
    if (saveDraft(t)) {
      draftWrittenRef.current = t;
    } else if (!draftWarnedRef.current) {
      // 写失败基本只有配额满一种。**照样只报一次**：它跟着输入走，每次都报会在打字时连弹。
      draftWarnedRef.current = true;
      notify("内容没能记住：本地存储已满", "warning");
    }
  }, [notify]);

  // 防抖，和偏好那条 effect 同构：正文一变就重新计时，停手 DRAFT_WRITE_MS 之后落一次盘。
  useEffect(() => {
    draftRef.current = raw;
    if (raw.length > DRAFT_MAX_CHARS) {
      // 超上限：不写。**本会话只提示一次**——这是跟着输入走的判定，每次都报会在打字过程中连弹。
      // 「恢复出来的存量本身就超限」（旧版本写的、或者被人手改过）也走这条路：
      // 内容照常显示，只是不再往回写。
      if (!draftWarnedRef.current) {
        draftWarnedRef.current = true;
        notify("内容超过 " + fmtBytes(DRAFT_MAX_CHARS) + "，不再自动记住，请用「保存」", "warning");
      }
      return;
    }
    const t = window.setTimeout(flushDraft, DRAFT_WRITE_MS);
    return () => window.clearTimeout(t);
  }, [raw, flushDraft, notify]);

  // 离页兜底，越过上面那个防抖窗口。挂两个事件是因为它们各管一段：
  // visibilitychange 管「切走 / 切回 / 手机回桌面」，pagehide 管「关闭或导航离开」，
  // 而 beforeunload 会弹确认框、且移动端常年不触发，不用它。
  // 关掉 / 崩溃这类事情本来就不在 500ms 防抖窗口内，兜底就是给它们准备的。
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushDraft(); };
    const onPageHide = () => flushDraft();
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushDraft]);

  // 记一条保存记录。**只有点「保存」才会走到这里**——不做任何自动记录。
  // 用户点保存就一定留下一条：**不去重**（内容相同也照样新增），否则「点了保存却没反应」。
  // 裁剪只作用于更旧的条目，最新这条永远保留；localStorage 配额只有几 MB，
  // 不裁的话 setItem 会抛 QuotaExceededError，被下面的 catch 吞掉，看起来就是「记录莫名其妙不存了」。
  const pushHistory = useCallback((text: string) => {
    if (!text.trim()) return;
    setHistory((prev) => {
      histIdRef.current += 1;
      const entry: HistoryEntry = { id: histIdRef.current, ts: Date.now(), text };
      const kept: HistoryEntry[] = [entry];
      let chars = entry.text.length;
      for (const h of prev) {
        chars += h.text.length;
        if (kept.length >= HIST_MAX || chars > HIST_MAX_CHARS) break;
        kept.push(h);
      }
      return kept;
    });
  }, []);

  // 「刚刚」要能自己走成「1 分钟前」。只在保存记录面板开着时每 30s 走一格——
  // 关掉就不跳，省得为了一个看不见的标签一直重渲染整个组件。
  useEffect(() => {
    if (rightPanel !== "history") return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, [rightPanel]);

  // 点条目 = 把存下来的 JSON 灌回输入框（保存记录本身只读，不提供编辑）。
  const restoreHistory = useCallback((h: HistoryEntry) => {
    replaceAll(h.text);
    notify("已载入", "success");
  }, [notify]);
  const removeHistory = useCallback((id: number) => { setHistory((prev) => prev.filter((h) => h.id !== id)); }, []);
  const clearHistory = useCallback(() => { setHistory([]); }, []);

  // 「上一个 / 下一个」长按连发：按下立刻走一步，停 380ms 后每 60ms 连发，松开或移出即停。
  // onClick 里只在 event.detail === 0 时走一步（键盘激活或脚本触发）——指针点击的 detail >= 1，
  // 那一步已经在 pointerdown 里走过了，不区分的话点一下会跳两格。
  const stopRepeat = useCallback(() => {
    if (repeatDelayRef.current !== null) { window.clearTimeout(repeatDelayRef.current); repeatDelayRef.current = null; }
    if (repeatTickRef.current !== null) { window.clearInterval(repeatTickRef.current); repeatTickRef.current = null; }
  }, []);

  const stepNav = useCallback((dir: number) => {
    unfold();
    setActiveIndex((i) => (navLenRef.current ? (i + dir + navLenRef.current) % navLenRef.current : 0));
  }, [unfold]);

  const startRepeat = useCallback((dir: number) => {
    stopRepeat();
    stepNav(dir);
    repeatDelayRef.current = window.setTimeout(() => {
      repeatTickRef.current = window.setInterval(() => stepNav(dir), 60);
    }, 380);
  }, [stepNav, stopRepeat]);

  useEffect(() => { navLenRef.current = nav.length; }, [nav.length]);
  useEffect(() => stopRepeat, [stopRepeat]);

  const onToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!ready || tooBig) return;
    const acc = new Set<string>();
    collectPaths(parsed.value, "$", acc);
    setExpanded(acc);
  }, [ready, tooBig, parsed.value]);

  const collapseAll = useCallback(() => setExpanded(new Set(["$"])), []);

  const registerRef = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(path, el);
    else rowRefs.current.delete(path);
  }, []);

  // 成功和失败都要说一声。以前 catch 是空的：剪贴板被浏览器拒绝时（非安全上下文、无权限等）
  // 气泡照样报「已复制」，等于在骗人——这是 error 型唯一的真实用武之地。
  const copy = useCallback((text: string, ok: string) => {
    navigator.clipboard.writeText(text)
      .then(() => notify(ok, "success"))
      .catch(() => notify("复制失败：浏览器拒绝了剪贴板访问", "error"));
  }, [notify]);

  const onCopyPath = useCallback((path: string) => { copy(path, "已复制路径"); }, [copy]);
  const onCopyValue = useCallback((value: JsonValue) => {
    copy(typeof value === "string" ? value : JSON.stringify(value, null, indent), "已复制值");
  }, [copy, indent]);

  // 格式化/压缩之后给个回音：内容本来就已经是那个样子时，屏幕上不会有任何变化，
  // 没有提示就会像是按钮坏了。
  const doFormat = () => {
    if (!raw.trim()) return;
    if (sortMode !== "off" && !ready) return;
    replaceAll(sortMode !== "off"
      ? JSON.stringify(deepSort(parsed.value, sortMode === "desc"), null, indent)
      : reformatJson(raw, indent, true));
    notify("已格式化");
  };
  const doMinify = () => {
    if (!raw.trim()) return;
    if (sortMode !== "off" && !ready) return;
    replaceAll(sortMode !== "off"
      ? JSON.stringify(deepSort(parsed.value, sortMode === "desc"))
      : reformatJson(raw, indent, false));
    notify("已压缩");
  };
  const doClear = () => { replaceAll(""); setQuery(""); notify("已清空", "warning"); };
  // 示例 / Unicode / 转义 / 全展开全折叠 / 切面板都不加提示：
  // 它们的结果就在眼前（输入框或树立刻变了），再加一条气泡只是噪音。
  const doSample = () => {
    replaceAll(SAMPLE);
    // 把示例的**第一层全部展开**。树默认只开根，那样点完「示例」看到的是一排收起来的
    // [10] / {6}，十条教程全藏在点击后面。展开一层正好够：教程条目和「这份数据」的字段
    // 都在第一层里露出来，而它自己那层嵌套仍收着，正好留给用户自己点开看折叠效果。
    // 路径用 joinKey 拼而不是手写：像「这份数据」这种非标识符的键会被转义成 $["这份数据"]。
    const open = new Set<string>(["$"]);
    const root = JSON.parse(SAMPLE) as JsonValue;
    if (isObject(root)) Object.keys(root).forEach((k) => open.add(joinKey("$", k)));
    setExpanded(open);
  };
  // 保存 = 把当前内容记进保存记录。这是它唯一的入口，没有自动记录。
  const doSave = () => {
    if (!raw.trim()) return;
    pushHistory(raw);
    notify("已保存到记录", "success");
  };
  const doCopy = () => { copy(raw, "已复制"); };
  // 文件名带秒级时间戳。以前固定叫 data.json，连下两次浏览器只会给
  // data(1).json —— 靠文件名分不清哪份是哪份。
  const doDownload = () => {
    if (!raw) return;
    const name = "json-" + fmtFileStamp(Date.now()) + ".json";
    const blob = new Blob([raw], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    notify("已下载 " + name);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    file.text().then((text) => { replaceAll(text); notify("已载入 " + file.name, "info"); }).catch(() => {});
  };

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (file) file.text().then((text) => { replaceAll(text); notify("已载入 " + file.name, "info"); }).catch(() => {});
    e.target.value = "";
  };
  // 恢复默认设置。只碰 SETTINGS_DEFAULTS 里那几项显示偏好（含分栏比例），
  // **不动右侧当前开着的面板**——这条不再是「它不是偏好」，它现在是了（会落盘），
  // 而是**位置**问题：「恢复默认」这个按钮就长在设置面板里，一按下去如果连面板本身也重置，
  // 站着点它的人会被当场弹到树形视图，等于按钮把自己脚下那块地抽走了。
  // 存下来的那份不用单独清：上面那个 effect 会把默认值照常写回去，效果一样。
  // 一律给提示：几项本来就在默认值时屏幕上什么都不会变，不提示就像按钮坏了
  // （和 格式化 是同一条规矩）。
  const doResetSettings = () => {
    setIndent(SETTINGS_DEFAULTS.indent);
    setFontSize(SETTINGS_DEFAULTS.fontSize);
    setShowLineNums(SETTINGS_DEFAULTS.showLineNums);
    setSortMode(SETTINGS_DEFAULTS.sortMode);
    setSideWidth(SETTINGS_DEFAULTS.sideWidth);
    notify("已恢复默认设置", "success");
  };

  const activeItem = nav.length ? nav[Math.min(activeIndex, nav.length - 1)] : null;
  const activeMatch = activeItem && activeItem.tree ? activeItem.tree : null;
  const queryLower = query.trim().toLowerCase();

  // 右侧面板**一张注册表**：活动栏那排按钮和面板正文都从它来，两边不可能对不上。
  // 顺序就是活动栏里从左到右的顺序（树形视图 / 保存记录 / 帮助 / 设置）。
  // 加一个面板 = 在 components/panels/ 下写一个组件，然后往这个数组里加一项——
  // 不用再去改一条三元表达式，也没有「帮助那个 else 分支」这种隐含顺序了。
  const panels: { id: PanelId; tip: string; icon: ReactNode; content: ReactNode }[] = [
    {
      id: "tree",
      tip: "树形视图",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 6h-8" /><path d="M21 12h-8" /><path d="M21 18h-8" /><path d="M3 6v4c0 1.1.9 2 2 2h3" /><path d="M3 10v6c0 1.1.9 2 2 2h3" /></svg>,
      content: <TreePanel ready={ready} tooBig={tooBig} empty={parsed.empty} value={parsed.value} expanded={expanded}
        onToggle={onToggle} query={queryLower} activePath={activeMatch ? activeMatch.path : ""} registerRef={registerRef}
        onCopyPath={onCopyPath} onCopyValue={onCopyValue} onExpandAll={expandAll} onCollapseAll={collapseAll} />,
    },
    {
      id: "history",
      tip: "保存记录",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>,
      content: <HistoryPanel history={history} now={now} onRestore={restoreHistory} onRemove={removeHistory} onClear={clearHistory} />,
    },
    {
      id: "help",
      tip: "帮助",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.3 9.4a2.8 2.8 0 1 1 3.5 2.7c-.5.18-.8.62-.8 1.15v.55" /><path d="M12 17.3h.01" /></svg>,
      content: <HelpPanel />,
    },
    {
      id: "settings",
      tip: "设置",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
      content: <SettingsPanel indent={indent} sortMode={sortMode} fontSize={fontSize} showLineNums={showLineNums}
        onIndent={setIndent} onSortMode={setSortMode} onFontSize={setFontSize} onShowLineNums={setShowLineNums} onReset={doResetSettings} />,
    },
  ];
  const openPanel = panels.find((p) => p.id === rightPanel);

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="topbar">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="VS Json"><path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" /><path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" /></svg>
          <span className="brand-name">VS Json</span>
          {/* 等待输入 / 节点·深度·字节。原来靠 margin-left:auto 顶在顶栏最右，
              现在挂在标题右边；顶栏右侧那块位置空出来另有用途。 */}
          <span className="muted small topbar-stats">{ready ? "节点 " + info.nodes + " · 深度 " + info.depth + " · " + raw.length + " 字节" : parsed.error ? "解析错误" : "等待输入"}</span>
        </div>

        <div className="searchbar">
          <div className="search-pill">
            <input
              className="search-input"
              value={query}
              onChange={(e) => { const v = e.target.value; setQuery(v); if (v.trim()) unfold(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); unfold(); setActiveIndex((i) => (nav.length ? (i + (e.shiftKey ? nav.length - 1 : 1)) % nav.length : 0)); } else if (e.key === "Escape") { setQuery(""); } }}
              placeholder="搜索"
            />
            <span className="search-count">{nav.length ? Math.min(activeIndex, nav.length - 1) + 1 + "/" + nav.length : "0/0"}</span>
            <span className="search-sep" />
            <button className="search-icon" onPointerDown={() => startRepeat(-1)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat} onPointerCancel={stopRepeat} onClick={(e) => { if (e.detail === 0) stepNav(-1); }} aria-label="上一个" data-tip="上一个">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
            </button>
            <button className="search-icon" onPointerDown={() => startRepeat(1)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat} onPointerCancel={stopRepeat} onClick={(e) => { if (e.detail === 0) stepNav(1); }} aria-label="下一个" data-tip="下一个">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <button className="search-icon" onClick={() => setQuery("")} aria-label="清除" data-tip="清除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        {/* 右上角指向开源仓库。顶栏右侧那片空白是用户点名留出来的，这就是它的用途。
            用的是 .icon-btn，于是尺寸、静息色和悬停/按下都自动跟工具栏那排图标一致
            （见 globals.css 的按钮交互规范），不需要另写一套。
            这是全项目唯一一个 <a>，target=_blank 让它开新标签——工具本身不该被导航走。
            rel 里 noreferrer 是关键：不给 GitHub 传 referrer，也不让新页面能操纵本页。 */}
        <a className="icon-btn topbar-link" href="https://github.com/hyglgithub/vs-json" target="_blank" rel="noopener noreferrer" aria-label="GitHub 仓库" data-tip="GitHub 仓库">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
        </a>
      </div>
      <div className="main">
        <div className="pane">
          <div className="pane-head">
            <div className="actions">
              <button className="tool-btn" onClick={doFormat}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><path d="M14 4l-4 16" /></svg>
                格式化
              </button>
              <button className="tool-btn" onClick={doMinify}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                压缩
              </button>
              <button className="tool-btn" onClick={doSample}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
                示例
              </button>
              <div className="menu-wrap" ref={(el) => { if (el) menuWrapRefs.current.set("unicode", el); else menuWrapRefs.current.delete("unicode"); }} onMouseEnter={() => { if (!menuLocked) setOpenMenu("unicode"); }} onMouseLeave={() => { if (!menuLocked) setOpenMenu(null); }}>
                <button className="tool-btn" onClick={() => toggleMenu("unicode")}>Unicode<span className="caret" /></button>
                {openMenu === "unicode" && (
                  <div className={"menu" + (menuFlip ? " flip" : "")}>
                    <button className="menu-item" onClick={() => { replaceAll(escapeUnicode(raw)); setOpenMenu(null); setMenuLocked(false); }}>中文转 Unicode</button>
                    <button className="menu-item" onClick={() => { replaceAll(unescapeUnicode(raw)); setOpenMenu(null); setMenuLocked(false); }}>Unicode 转中文</button>
                  </div>
                )}
              </div>
              <div className="menu-wrap" ref={(el) => { if (el) menuWrapRefs.current.set("escape", el); else menuWrapRefs.current.delete("escape"); }} onMouseEnter={() => { if (!menuLocked) setOpenMenu("escape"); }} onMouseLeave={() => { if (!menuLocked) setOpenMenu(null); }}>
                <button className="tool-btn" onClick={() => toggleMenu("escape")}>转义<span className="caret" /></button>
                {openMenu === "escape" && (
                  <div className={"menu" + (menuFlip ? " flip" : "")}>
                    <button className="menu-item" onClick={() => { replaceAll(escapeText(raw)); setOpenMenu(null); setMenuLocked(false); }}>添加 {BS} 转义</button>
                    <button className="menu-item" onClick={() => { replaceAll(unescapeText(raw)); setOpenMenu(null); setMenuLocked(false); }}>去除 {BS} 转义</button>
                  </div>
                )}
              </div>
            </div>
            <div className="tool-icons">
              <button className="icon-btn" onClick={doSave} data-tip="保存到记录" aria-label="保存到记录"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg></button>
              <button className="icon-btn" onClick={() => fileRef.current?.click()} data-tip="上传" aria-label="上传"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg></button>
              <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={onPickFile} />
              <button className="icon-btn" onClick={doDownload} data-tip="下载" aria-label="下载"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg></button>
              <button className="icon-btn" onClick={doCopy} data-tip="复制" aria-label="复制"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
              {/* 扫把，不是垃圾桶。清空是「把这儿扫干净」，和保存记录里那条
                  「删除」不是一回事；两者以前共用垃圾桶图标，容易看错。 */}
              <button className="icon-btn" onClick={doClear} data-tip="清空" aria-label="清空"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="10.7" y="3" width="2.6" height="7" rx="0.4"/><rect x="5.5" y="10" width="13" height="4" rx="1"/><path d="M7.5 14h9l2.5 7h-14z"/><path d="M10 15v6"/><path d="M14 15v6"/></svg></button>
            </div>
          </div>
          {/* .folded 只在真的有行被藏起来时挂上：它会把 textarea 整层隐藏、让 .editor-nums
              接管滚动。折叠期间编辑器是只读展示态——textarea 藏不了自己的部分文字。 */}
          <Editor raw={raw} onChange={setRaw} foldedText={foldedText} highlightRaw={highlightRaw} shown={shown}
            ranges={ranges} folded={folded} folding={folding} gutterShown={gutterShown} gutterOn={gutterOn}
            style={editorStyle} empty={parsed.empty} editorRef={editorRef} backRef={backRef} marksRef={marksRef}
            numsRef={numsRef} onToggleFold={toggleFold} onUnfold={unfold} />

          {parsed.error && <div className="err">{parsed.error}</div>}
          {tooBig && <div className="err">超过 5MB：仅支持格式化与压缩，树形视图已禁用</div>}
        </div>
        {rightPanel !== "none" && (
          <>
            <div className="splitter" onPointerDown={onSplitDown} onPointerMove={onSplitMove} onPointerUp={onSplitUp} onPointerCancel={onSplitUp} />
            <div className="side-body" style={{ width: sideWidth + "%" }}>
              {openPanel?.content}
            </div>
          </>
        )}
        <div className="activity">
          {panels.map((p) => (
            <button key={p.id} className={"act" + (rightPanel === p.id ? " on" : "")} data-tip={p.tip} aria-label={p.tip}
              onClick={() => setRightPanel((v) => (v === p.id ? "none" : p.id))}>{p.icon}</button>
          ))}
        </div>
      </div>
      {/* 消息提示：放在 .app 最后一个子元素即可——position:fixed 脱离文档流，
          不会参与 .app 的 flex 布局；也无需 portal 或改 page.tsx。 */}
      <Toasts toasts={toasts} onDismiss={dropToast} />
    </div>
  );
}
