import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type SelOption = { value: string; label: string };

// 设置面板用的下拉。**故意不用原生 <select>**：它的弹层由系统绘制，选中项是系统蓝实心高亮、
// 四角方硬，CSS 一点都碰不到。这里换成「按钮 + .menu」，于是设置里的下拉和工具栏的
// Unicode / 转义 菜单共用同一套 hover / 按下 / 圆角 / 阴影。
// 焦点始终留在触发按钮上，弹层里的项只有 role="option"（不参与 Tab 序列），
// 键盘操作在按钮的 onKeyDown 里统一处理——这是 ARIA combobox 的标准做法。
//
// 这是唯一的「自己带一点状态」的展示组件：open / hi / pos 都是弹层的**局部 UI 状态**，
// 和 JsonTool 里的业务状态没关系，所以留在这里而不上提。
export default function Select({ label, value, options, onChange }: { label: string; value: string; options: SelOption[]; onChange: (v: string) => void }) {
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
