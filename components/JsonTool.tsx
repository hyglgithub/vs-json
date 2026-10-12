"use client";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, DragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";


import { BS, HIST_KEY, HIST_MAX, HIST_MAX_CHARS, NL1, NL2, SAMPLE, SAMPLE_GUIDE_KEY, TOAST_MAX, TOAST_MS, TOAST_OUT_MS } from "../lib/constants";
import type { HistoryEntry, ToastKind } from "../lib/constants";
import { collectPaths, computeStats, deepSort, findMatches, foldRanges, isObject, joinIndex, joinKey, valueClass } from "../lib/json";
import type { FoldRange, JsonValue, Match } from "../lib/json";
import { escapeText, escapeUnicode, reformatJson, unescapeText, unescapeUnicode } from "../lib/text";
import { fmtBytes, fmtFileStamp, fmtRel, fmtTime, histPreview } from "../lib/format";
import { HELP_MORE, HELP_SECTIONS, HINT_PICK } from "../lib/help";

// 行号层要不要渲染的阈值。行号是**按逻辑行**渲染的（见 .editor-nums 的注释），
// 一个逻辑行一个 <div>，所以行数直接等于 DOM 节点数。超过这个数就不画行号了：
// 输入框本身仍然正常，只是左边没有号码。别把它当成"性能优化"删掉。
const LINE_NUM_MAX = 20000;

// 设置的默认值。**各个 useState 的初值和「恢复默认」按钮共用这一份**，
// 否则改了初值忘了改按钮（或者反过来），按钮就会把设置恢复到一个曾经是默认值的旧值。
//
// 这里**故意不含 AI 服务地址和访问密钥**。那两项是用户为了连上自己的服务填的**凭据**，
// 不是显示偏好：清掉之后密钥得重新去找，而「恢复默认设置」这种按钮不该毁掉数据。
// 缩进 / 字体大小 / 行号 / Key 排序 是纯偏好，重置显然安全且随时可以再调回来。
const SETTINGS_DEFAULTS: { indent: number; fontSize: number; showLineNums: boolean; sortMode: "off" | "asc" | "desc" } = {
  indent: 2,
  fontSize: 15,
  showLineNums: true,
  sortMode: "off",
};

function Highlight({ text, query, active }: { text: string; query: string; active?: boolean }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(q, 0);
  let n = 0;
  while (idx !== -1) {
    if (idx > i) out.push(text.slice(i, idx));
    out.push(<mark className={"mark" + (active ? " active" : "")} key={n++}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
    idx = lower.indexOf(q, i);
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

type NodeProps = {
  label: string;
  value: JsonValue;
  path: string;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  query: string;
  activePath: string;
  registerRef: (path: string, el: HTMLDivElement | null) => void;
  onCopyPath: (path: string) => void;
  onCopyValue: (value: JsonValue) => void;
};

function JsonNode(props: NodeProps) {
  const { label, value, path, depth, expanded, onToggle, query, activePath, registerRef, onCopyPath, onCopyValue } = props;
  // 提示由 onCopyPath / onCopyValue 自己发——它们才知道剪贴板到底写成功没有，
  // 这里报「已复制」会变成瞎猜（以前就是瞎猜）。
  const isArr = Array.isArray(value);
  const isObj = isObject(value);
  const isContainer = isArr || isObj;
  const open = isContainer && expanded.has(path);
  const active = activePath === path;
  const entries: Array<[string, JsonValue]> = isArr
    ? (value as JsonValue[]).map((item, i) => [String(i), item] as [string, JsonValue])
    : isObj
      ? Object.keys(value as { [key: string]: JsonValue }).map((k) => [k, (value as { [key: string]: JsonValue })[k]] as [string, JsonValue])
      : [];
  return (
    <div>
      <div className={"row" + (active ? " active" : "")} ref={(el) => { registerRef(path, el); }}>
        {isContainer ? <button className="twist" onClick={() => onToggle(path)}>{open ? "-" : "+"}</button> : <span className="twist" />}
        <span className="idx copyable" onDoubleClick={() => onCopyPath(path)}><Highlight text={label} query={query} /></span>
        <span className="colon">:</span>
        {isContainer ? (
          <>
            <span className="badge">{isArr ? "[" + entries.length + "]" : "{" + entries.length + "}"}</span>
            {!open && <span className="muted small"> ...</span>}
          </>
        ) : (
          <span className={"val copyable " + valueClass(value)} onDoubleClick={() => onCopyValue(value)}><Highlight text={value === null ? "null" : JSON.stringify(value)} query={query} /></span>
        )}
      </div>
      {open && (
        <div className="children">
          {entries.map(([k, item]) => (
            <JsonNode key={k} label={isArr ? "[" + k + "]" : k} value={item} path={isArr ? joinIndex(path, Number(k)) : joinKey(path, k)} depth={depth + 1} expanded={expanded} onToggle={onToggle} query={query} activePath={activePath} registerRef={registerRef} onCopyPath={onCopyPath} onCopyValue={onCopyValue} />
          ))}
        </div>
      )}
    </div>
  );
}


// 每种消息类型一个图标。primary 和 info 同用 ⓘ（Element 也是这样，只有颜色不同）。
function toastIcon(kind: ToastKind): ReactNode {
  if (kind === "success") {
    return <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.4l2.6 2.6L16 9.6" /></svg>;
  }
  if (kind === "warning") {
    return <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l9 16H3z" /><path d="M12 10v4.5" /><path d="M12 17.6h.01" /></svg>;
  }
  if (kind === "error") {
    return <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6" /><path d="M9 9l6 6" /></svg>;
  }
  return <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.6h.01" /></svg>;
}

// 空态里的提示块。文案**从 lib/help.ts 的同一份教程里挑**（HINT_PICK 说挑哪几节、每节几行），
// 不在这里另写一份短文案——否则空态和帮助面板迟早各说各的。
// 这儿只负责排版，一个字都不生成。
function Hint({ where }: { where: keyof typeof HINT_PICK }) {
  const pick = HINT_PICK[where];
  return (
    <div className="hint">
      {HELP_SECTIONS.filter((s) => pick.ids.includes(s.id)).map((s) => (
        <div className="hint-sec" key={s.id}>
          <span className="hint-title">{s.title}</span>
          {s.items.slice(0, pick.lines).map((t) => (
            <span className="hint-line" key={t}>{t}</span>
          ))}
        </div>
      ))}
      <span className="hint-more">{HELP_MORE}</span>
    </div>
  );
}

type SelOption = { value: string; label: string };

// 设置面板用的下拉。**故意不用原生 <select>**：它的弹层由系统绘制，选中项是系统蓝实心高亮、
// 四角方硬，CSS 一点都碰不到。这里换成「按钮 + .menu」，于是设置里的下拉和工具栏的
// Unicode / 转义 菜单共用同一套 hover / 按下 / 圆角 / 阴影。
// 焦点始终留在触发按钮上，弹层里的项只有 role="option"（不参与 Tab 序列），
// 键盘操作在按钮的 onKeyDown 里统一处理——这是 ARIA combobox 的标准做法。
function Select({ label, value, options, onChange }: { label: string; value: string; options: SelOption[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  // 高亮项。鼠标划入和键盘上下都改它，两者共用同一个高亮，不会各亮各的。
  const [hi, setHi] = useState(0);
  // 弹层的**视口**坐标。弹层走 position:fixed，理由见下面那条 useLayoutEffect。
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cur = options.findIndex((o) => o.value === value);
  const current = options[cur === -1 ? 0 : cur];

  const openMenu = () => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    setHi(cur === -1 ? 0 : cur);
    setOpen(true);
  };

  // 下方放不下就翻到按钮上方。
  // 必须用 useLayoutEffect 而不是 useEffect：它在浏览器**绘制之前**跑完，
  // 所以「先画在下面、再翻到上面」这一下不会在屏幕上闪出来。
  useLayoutEffect(() => {
    const m = menuRef.current;
    const b = btnRef.current;
    if (!open || !m || !b) return;
    const h = m.offsetHeight;
    const r = b.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 6;
    const above = r.top - 6;
    if (below < h && above > below) setPos((p) => ({ ...p, top: r.top - h - 6 }));
  }, [open]);

  // 点外面关掉；面板一滚也关掉。
  // 滚动那条是因为弹层是 position:fixed：它不跟着 .settings 的滚动走，
  // 不关的话会脱离按钮浮在原地。scroll 不冒泡，所以要 capture。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !wrapRef.current || !wrapRef.current.contains(t)) setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const commit = (v: string) => { onChange(v); setOpen(false); };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) commit(options[hi].value);
      else { setHi(cur === -1 ? 0 : cur); setOpen(true); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      // 收起时方向键直接改值（对齐原生 select 的手感），展开时只移动高亮
      if (open) setHi((i) => (i + d + options.length) % options.length);
      else commit(options[(cur + d + options.length) % options.length].value);
    }
  };

  return (
    <div className="sel" ref={wrapRef}>
      <button ref={btnRef} type="button" className="input sel-btn" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => { if (open) setOpen(false); else openMenu(); }} onKeyDown={onKeyDown}>
        <span className="sel-label">{current.label}</span>
      </button>
      {open && (
        <div ref={menuRef} className="menu sel-menu" role="listbox" aria-label={label} style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {options.map((o, i) => (
            <div key={o.value} role="option" aria-selected={o.value === value}
              className={"menu-item" + (o.value === value ? " on" : "") + (i === hi ? " hi" : "")}
              onMouseEnter={() => setHi(i)}
              onClick={() => commit(o.value)}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JsonTool() {
  const [raw, setRaw] = useState("");
  const [indent, setIndent] = useState(SETTINGS_DEFAULTS.indent);
  // 编辑器字号。只作用于左侧输入框（含行号），不影响右侧树和面板——
  // 这是代码编辑器里「字体大小」的通常含义。默认 15 对齐 body 的 font。
  const [fontSize, setFontSize] = useState(SETTINGS_DEFAULTS.fontSize);
  // 行号槽（号码 + 折叠三角）是否显示，设置面板可关。
  const [showLineNums, setShowLineNums] = useState(SETTINGS_DEFAULTS.showLineNums);
  // 已折叠的块，存的是**开括号所在的行号**（0 起）。折叠期间编辑器整体转只读展示，见 folding。
  const [folded, setFolded] = useState<Set<number>>(new Set());
  const [sortMode, setSortMode] = useState<"off" | "asc" | "desc">(SETTINGS_DEFAULTS.sortMode);
  const [openMenu, setOpenMenu] = useState<"unicode" | "escape" | null>(null);
  const [menuLocked, setMenuLocked] = useState(false);
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["$"]));
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [aiEndpoint, setAiEndpoint] = useState("http://120.77.200.18:8787");
  const [aiKey, setAiKey] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: ToastKind; leaving: boolean }[]>([]);
  // 标识符一律叫 history / hist*，界面上一律叫「保存记录」——对不上是故意的：
  // 它原来叫「历史记录」，改名只改了用户可见的部分。而 localStorage 的键
  // jsontool.history **不能跟着改**，改了等于把已存下的条目全部丢弃，
  // 所以常量名跟着键走，不去制造「常量叫 SAVED_KEY、值却是 jsontool.history」那种别扭。
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [rightPanel, setRightPanel] = useState<"none" | "tree" | "ai" | "settings" | "history" | "help">("tree");
  const [sideWidth, setSideWidth] = useState(50);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const backRef = useRef<HTMLPreElement | null>(null);
  const marksRef = useRef<HTMLPreElement | null>(null);
  // 行号层。它自己也是 overflow:hidden 的滚动容器，靠直接赋 scrollTop 跟 textarea 对齐，
  // 和 .editor-back 是同一套办法。横向不跟——行号要钉在左槽里，不能跟着横向滚走。
  const numsRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const histIdRef = useRef(0);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef<Map<number, number>>(new Map());
  // 退场计时器。键存在 == 这条已经在摘除队列里了，用它代替单独的「已标记」集合。
  const outTimersRef = useRef<Map<number, number>>(new Map());
  // 「上一个 / 下一个」长按连发用的三个计时器/长度
  const navLenRef = useRef(0);
  const repeatDelayRef = useRef<number | null>(null);
  const repeatTickRef = useRef<number | null>(null);

  const onSplitDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: sideWidth };
  };
  const onSplitMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const deltaPct = ((d.startX - e.clientX) / window.innerWidth) * 100;
    setSideWidth(Math.min(80, Math.max(20, d.startW + deltaPct)));
  };
  const onSplitUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("jsontool.ai");
      if (saved) {
        const cfg = JSON.parse(saved) as { endpoint?: string; key?: string };
        if (cfg.endpoint) setAiEndpoint(cfg.endpoint);
        if (cfg.key) setAiKey(cfg.key);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("jsontool.ai", JSON.stringify({ endpoint: aiEndpoint, key: aiKey }));
    } catch {
    }
  }, [aiEndpoint, aiKey]);

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
  const doClear = () => { replaceAll(""); setQuery(""); setAiOutput(""); setAiError(""); notify("已清空", "warning"); };
  // 示例 / Unicode / 转义 / 全展开全折叠 / 切面板都不加提示：
  // 它们的结果就在眼前（输入框或树立刻变了），再加一条气泡只是噪音。
  const doSample = () => {
    replaceAll(SAMPLE);
    // 示例自带的那段用法说明在第一层。树默认只展开根，不顺手把它也展开的话，
    // 点完「示例」看到的只是一个收起来的 _用法 [5]——教程藏在一次点击后面。
    // 用 joinKey 拼路径而不是手写 "$._用法"：非标识符的键会被转义成 $["_用法"]。
    setExpanded(new Set(["$", joinKey("$", SAMPLE_GUIDE_KEY)]));
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


  const organize = async () => {
    if (!ready || aiBusy || tooBig) return;
    setAiBusy(true);
    setAiOutput("");
    setAiError("");
    try {
      const res = await fetch("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: aiEndpoint, key: aiKey, json: JSON.stringify(parsed.value, null, 2) }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text();
        throw new Error(msg || "AI 服务错误");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        let sep = buf.indexOf(NL2);
        while (sep !== -1) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          for (const line of frame.split(NL1)) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            const obj = JSON.parse(data) as { t: string; v?: string };
            if (obj.t === "delta" && obj.v) {
              acc += obj.v;
              setAiOutput(acc);
            } else if (obj.t === "done" && obj.v) {
              acc = obj.v;
              setAiOutput(obj.v);
            } else if (obj.t === "error" && obj.v) {
              setAiError(obj.v);
            }
          }
          sep = buf.indexOf(NL2);
        }
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiBusy(false);
    }
  };

  // 恢复默认设置。只碰 SETTINGS_DEFAULTS 里那四项显示偏好，
  // **不动 AI 服务地址和访问密钥**——那是用户填的凭据，不是偏好，清掉就得重新去找。
  // 一律给提示：四项本来就在默认值时屏幕上什么都不会变，不提示就像按钮坏了
  // （和 格式化 是同一条规矩）。
  const doResetSettings = () => {
    setIndent(SETTINGS_DEFAULTS.indent);
    setFontSize(SETTINGS_DEFAULTS.fontSize);
    setShowLineNums(SETTINGS_DEFAULTS.showLineNums);
    setSortMode(SETTINGS_DEFAULTS.sortMode);
    notify("已恢复默认设置", "success");
  };

  const activeItem = nav.length ? nav[Math.min(activeIndex, nav.length - 1)] : null;
  const activeMatch = activeItem && activeItem.tree ? activeItem.tree : null;
  const queryLower = query.trim().toLowerCase();

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="topbar">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="JSON 工具"><path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" /><path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" /></svg>
          <span className="brand-name">Jsontool</span>
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
              <div className="menu-wrap" onMouseEnter={() => { if (!menuLocked) setOpenMenu("unicode"); }} onMouseLeave={() => { if (!menuLocked) setOpenMenu(null); }}>
                <button className="tool-btn" onClick={() => toggleMenu("unicode")}>Unicode<span className="caret" /></button>
                {openMenu === "unicode" && (
                  <div className="menu">
                    <button className="menu-item" onClick={() => { replaceAll(escapeUnicode(raw)); setOpenMenu(null); setMenuLocked(false); }}>中文转 Unicode</button>
                    <button className="menu-item" onClick={() => { replaceAll(unescapeUnicode(raw)); setOpenMenu(null); setMenuLocked(false); }}>Unicode 转中文</button>
                  </div>
                )}
              </div>
              <div className="menu-wrap" onMouseEnter={() => { if (!menuLocked) setOpenMenu("escape"); }} onMouseLeave={() => { if (!menuLocked) setOpenMenu(null); }}>
                <button className="tool-btn" onClick={() => toggleMenu("escape")}>转义<span className="caret" /></button>
                {openMenu === "escape" && (
                  <div className="menu">
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
          <div className={"editor-wrap" + (folding ? " folded" : "") + (gutterShown ? " guttered" : "")} style={editorStyle}>
            <pre className="editor-back" ref={backRef} aria-hidden="true">{foldedText}</pre>
            <textarea ref={editorRef} className="editor-front" value={raw} onChange={(e) => setRaw(e.target.value)} onScroll={(e) => { const st = e.currentTarget.scrollTop; const sl = e.currentTarget.scrollLeft; const bk = backRef.current; if (bk) { bk.scrollTop = st; bk.scrollLeft = sl; } const mk = marksRef.current; if (mk) { mk.scrollTop = st; mk.scrollLeft = sl; } const nm = numsRef.current; if (nm) nm.scrollTop = st; }} spellCheck={false} aria-label="JSON 输入" />
            {/* 折叠期间不做搜索高亮：命中位置是按 raw 的偏移算的，折叠后行号已经重排，
                硬套上去只会画错地方。留空层是为了保住 ref，搜索滚动那个 effect 还要用它。 */}
            <pre className="editor-marks" ref={marksRef} aria-hidden="true">{folding ? "" : highlightRaw}</pre>
            {/* 行号层：`{s.text}` 是**透明的**，只用来把每个逻辑行撑到和编辑器里一样高，
                这样折行的续行不会让后面的号码往上跑。真正显示的只有绝对定位的 .num。
                它是第 4 层，和前三层不共享滚动——平时由 textarea 的 onScroll 推，
                折叠时（textarea 已不可交互）反过来由它自己推给另外两层。 */}
            {gutterShown && (
              <div className="editor-nums" ref={numsRef} aria-hidden="true"
                onClick={() => { if (folding) setFolded(new Set()); }}
                onScroll={(e) => {
                  if (!folding) return;
                  const st = e.currentTarget.scrollTop;
                  const bk = backRef.current; if (bk) bk.scrollTop = st;
                  const mk = marksRef.current; if (mk) mk.scrollTop = st;
                }}>
                {shown.map((s, k) => (
                  <div className="num-line" key={s.i}>
                    {gutterOn && <span className="num">{k + 1}</span>}
                    {ranges.has(s.i) && (
                      <button className={"num-fold" + (folding && folded.has(s.i) ? " on" : "")} tabIndex={-1} aria-label="折叠"
                        onClick={(e) => { e.stopPropagation(); toggleFold(s.i); }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.4 2.6L5 7.2l3.6-4.6z" fill="currentColor" /></svg>
                      </button>
                    )}
                    {s.text}
                  </div>
                ))}
              </div>
            )}
            {/* 输入框空态。**浮在四层之上的一条独立分支，不进那套盒子度量**——
                文本为空时三层里一个字都没有，这里画什么都不会和它们错位。
                它是 .editor-wrap 的最后一个子元素：z-index 和 .editor-marks 同为 1，
                打平就按 DOM 顺序决胜，排最后正好压住那一层（那一层此时也是空的）。
                必须低于 .editor-front 的 2 —— 那个是 z-index 决定的，和 DOM 顺序无关。 */}
            {parsed.empty && (
              <div className="editor-empty" aria-hidden="true">
                <Hint where="editor" />
              </div>
            )}
          </div>

          {parsed.error && <div className="err">{parsed.error}</div>}
          {tooBig && <div className="err">超过 5MB：仅支持格式化与压缩，树形视图与 AI 已禁用</div>}
        </div>
        {rightPanel !== "none" && (
          <>
            <div className="splitter" onPointerDown={onSplitDown} onPointerMove={onSplitMove} onPointerUp={onSplitUp} onPointerCancel={onSplitUp} />
            <div className="side-body" style={{ width: sideWidth + "%" }}>
            {rightPanel === "tree" ? (
              <div className="pane">
                <div className="pane-head">
                  <span>树形视图</span>
                  <div className="tree-actions">
                    <button className="tool-btn" onClick={expandAll}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8" /><path d="M8 12h8" /></svg>
                      全展开
                    </button>
                    <button className="tool-btn" onClick={collapseAll}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 12h8" /></svg>
                      全折叠
                    </button>
                  </div>
                </div>
                <div className="tree">
                  {ready && !tooBig && <JsonNode label="$" value={parsed.value} path="$" depth={0} expanded={expanded} onToggle={onToggle} query={queryLower} activePath={activeMatch ? activeMatch.path : ""} registerRef={registerRef} onCopyPath={onCopyPath} onCopyValue={onCopyValue} />}
                  {ready && tooBig && <div className="pad muted">数据超过 5MB，未渲染树</div>}
                  {!ready && !parsed.empty && <div className="pad muted">修复 JSON 后显示结构</div>}
                  {parsed.empty && <div className="pad"><Hint where="tree" /></div>}
                </div>
              </div>
            ) : rightPanel === "ai" ? (
              <div className="ai">
                <div className="pane-head">
                  <span>AI 整理</span>
                  <button className="tool-btn ai-run" onClick={organize}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
                    {aiBusy ? "分析中" : "开始分析"}
                  </button>
                </div>
                {aiError && <div className="err inline pad">{aiError}</div>}
                <pre className="ai-output">{aiOutput || "尚未分析"}</pre>
              </div>
            ) : rightPanel === "history" ? (
              <div className="pane">
                <div className="pane-head">
                  <span>保存记录（{history.length}条）</span>
                  <button className="tool-btn hist-clear" onClick={clearHistory}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>清空记录</button>
                </div>
                <div className="tree">
                  {/* 两个上限写在这节提示的最后一条里（数字由 HIST_MAX / HIST_MAX_CHARS 算出来）。
                      以前这里另有一行小字重复说上限，数字还是手抄的，和常量一改就对不上——
                      现在只此一处。 */}
                  {history.length === 0 && <div className="pad"><Hint where="history" /></div>}
                  {history.map((h) => (
                    <div className="hist-row" key={h.id}>
                      <button className="hist-main" onClick={() => restoreHistory(h)}>
                        <span className="hist-line1">
                          <span className="hist-rel">{fmtRel(h.ts, now)}</span>
                          <span className="hist-meta">{fmtTime(h.ts)} · {fmtBytes(h.text.length)}</span>
                        </span>
                        <span className="hist-prev">{histPreview(h.text)}</span>
                      </button>
                      <button className="hist-del" onClick={() => removeHistory(h.id)} data-tip="删除" aria-label="删除">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : rightPanel === "settings" ? (
              <div className="pane">
                <div className="pane-head">
                  <span>设置</span>
                  {/* 纯图标按钮才挂 data-tip，这个有文字，不加（见 CLAUDE.md 的提醒规矩） */}
                  <button className="tool-btn set-reset" onClick={doResetSettings}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5v5h5" /></svg>
                    恢复默认
                  </button>
                </div>
                {/* 每项一块：标题（主色粗体）→ 说明（灰色小字）→ 控件，三者左对齐。
                    这是照 VS Code 设置页的结构来的。
                    外层**不用 <label>**：<label> 会把内部任何一次点击转发给它关联的控件，
                    而下拉弹层里的选项也在这一块里，点选项会连带把触发按钮再点一次、菜单立刻重新弹开。
                    改用 aria-label 给控件命名。 */}
                <div className="settings">
                  <div className="setting">
                    <span className="setting-title">缩进</span>
                    <span className="setting-desc">格式化与压缩时，每一层嵌套缩进几个空格。</span>
                    <Select label="缩进" value={String(indent)} onChange={(v) => setIndent(Number(v))}
                      options={[{ value: "1", label: "1 空格" }, { value: "2", label: "2 空格" }, { value: "3", label: "3 空格" }, { value: "4", label: "4 空格" }]} />
                  </div>
                  {/* Key 排序 放在字体大小上面：它和缩进一样是**格式化/压缩**的选项，
                      两项挨着；字体大小和行号则是**编辑器显示**的偏好，自己成一组。 */}
                  <div className="setting">
                    <span className="setting-title">Key 排序</span>
                    <span className="setting-desc">格式化与压缩时，按键名重新排列各层级的字段。</span>
                    <Select label="Key 排序" value={sortMode} onChange={(v) => setSortMode(v as "off" | "asc" | "desc")}
                      options={[{ value: "off", label: "关闭" }, { value: "asc", label: "升序" }, { value: "desc", label: "降序" }]} />
                  </div>
                  <div className="setting">
                    <span className="setting-title">字体大小</span>
                    <span className="setting-desc">只作用于左侧输入框，含行号与折叠三角。</span>
                    <Select label="字体大小" value={String(fontSize)} onChange={(v) => setFontSize(Number(v))}
                      options={[12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => ({ value: String(n), label: n + " px" }))} />
                  </div>
                  <div className="setting">
                    <span className="setting-title">行号</span>
                    <label className="setting-check">
                      <input type="checkbox" checked={showLineNums} onChange={(e) => setShowLineNums(e.target.checked)} />
                      <span>在输入框左侧显示行号。关掉后折叠三角仍在，只是不再编号。</span>
                    </label>
                  </div>
                  <div className="settings-sep" />
                  <div className="setting">
                    <span className="setting-title">AI 服务地址</span>
                    <span className="setting-desc">点「开始分析」时请求的服务端地址。</span>
                    <input className="input" aria-label="AI 服务地址" value={aiEndpoint} onChange={(e) => setAiEndpoint(e.target.value)} />
                  </div>
                  <div className="setting">
                    <span className="setting-title">访问密钥</span>
                    <span className="setting-desc">存在本机 localStorage，每次请求经服务端转发，服务端不保存。</span>
                    <input className="input" aria-label="访问密钥" type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} />
                  </div>
                </div>
              </div>
            ) : (
              /* 帮助面板 = 整篇教程。文案全部来自 lib/help.ts 的 HELP_SECTIONS，
                 这里只负责排版；另外三个空态是从**同一份**里挑几节显示的。
                 想改帮助里说的话，去改那个文件，别在这里加字符串。 */
              <div className="pane">
                <div className="pane-head">
                  <span>帮助</span>
                </div>
                <div className="help">
                  {HELP_SECTIONS.map((s) => (
                    <div className="help-sec" key={s.id}>
                      <span className="help-title">{s.title}</span>
                      {s.items.map((t) => (
                        <span className="help-line" key={t}>{t}</span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          </>
        )}
        <div className="activity">
          <button className={"act" + (rightPanel === "tree" ? " on" : "")} data-tip="树形视图" aria-label="树形视图" onClick={() => setRightPanel((v) => (v === "tree" ? "none" : "tree"))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 6h-8" /><path d="M21 12h-8" /><path d="M21 18h-8" /><path d="M3 6v4c0 1.1.9 2 2 2h3" /><path d="M3 10v6c0 1.1.9 2 2 2h3" /></svg></button>
          <button className={"act" + (rightPanel === "history" ? " on" : "")} data-tip="保存记录" aria-label="保存记录" onClick={() => setRightPanel((v) => (v === "history" ? "none" : "history"))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg></button>
          <button className={"act" + (rightPanel === "ai" ? " on" : "")} data-tip="AI 整理" aria-label="AI 整理" onClick={() => setRightPanel((v) => (v === "ai" ? "none" : "ai"))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg></button>
          <button className={"act" + (rightPanel === "help" ? " on" : "")} data-tip="帮助" aria-label="帮助" onClick={() => setRightPanel((v) => (v === "help" ? "none" : "help"))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.3 9.4a2.8 2.8 0 1 1 3.5 2.7c-.5.18-.8.62-.8 1.15v.55" /><path d="M12 17.3h.01" /></svg></button>
          <button className={"act" + (rightPanel === "settings" ? " on" : "")} data-tip="设置" aria-label="设置" onClick={() => setRightPanel((v) => (v === "settings" ? "none" : "settings"))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>
        </div>
      </div>
      {/* 消息提示：放在 .app 最后一个子元素即可——position:fixed 脱离文档流，
          不会参与 .app 的 flex 布局；也无需 portal 或改 page.tsx。 */}
      <div className="toasts" role="status" aria-live="polite">
        {/* 只有点 × 才关得掉，点气泡正文不做任何事（对齐 ElMessage 的行为）。
            × 上也不挂 data-tip：气泡贴在视口右下角，提示框会被视口边缘裁掉。 */}
        {toasts.map((t) => (
          <div className={"toast " + t.kind + (t.leaving ? " leaving" : "")} key={t.id}>
            {toastIcon(t.kind)}
            <span className="toast-text">{t.text}</span>
            <button className="toast-x" onClick={() => dropToast(t.id)} aria-label="关闭">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
