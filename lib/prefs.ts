// 用户偏好的读写。
//
// 这里**不含 React、不含组件状态**（见 CLAUDE.md 的 lib/ 分界）：就是「读一小袋设置 /
// 写回去」两个函数，外加一层校验。它是全项目唯一碰 PREFS_KEY 的地方。
//
// 为什么单独一个键，而不是并进 jsontool.history：
//   · 那边是**用户数据**，不能被「恢复默认」碰掉；偏好则是会被整体重置的，
//     单独放才好一次写干净；
//   · 带版本号，将来形状变了可以干脆丢掉不认得的旧值，而不是读到半个旧格式崩掉。
//
// **PREFS_KEY 的值不能改**：改了等于所有人的偏好被静默清空，重回默认。
// （和 HIST_KEY 同一个道理，那边还多一层——偏好丢了只是回到默认，记录丢了是丢数据。）

export const PREFS_KEY = "jsontool.prefs";
const PREFS_V = 1;

// 偏好写回去的防抖时长。**不是可选的优化**：拖分栏时 sideWidth 每帧都在变，
// 一次拖动能有一两百次写入，而 localStorage 是同步 IO，不防抖会明显发顿。
// 300ms 足够让一次拖动只在停手后落一次盘。
export const PREFS_WRITE_MS = 300;

// 可选项清单。**设置面板的下拉也从这里取**，不再各写一份——
// 校验认不认某个值，和界面上能不能选出那个值，必须是同一份。
export const INDENT_STEPS = [1, 2, 3, 4];
export const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20];

// 分栏的可拖范围（右侧面板宽度百分比）。JS 里夹取值、下面校验存量都走这两个数。
export const SIDE_MIN = 20;
export const SIDE_MAX = 80;

export type SortMode = "off" | "asc" | "desc";

export type Prefs = {
  indent: number;
  fontSize: number;
  showLineNums: boolean;
  sortMode: SortMode;
  sideWidth: number;
};

// 默认值。**useState 的初值和「恢复默认」按钮共用这一份**，否则改了初值忘了改按钮
// （或者反过来），按钮就会把设置恢复到一个曾经是默认值的旧值。
//
// 这里面全是**显示偏好**：重置显然是安全的，而且随时可以再调回来。
// 用户数据（保存记录）和任何凭据都不在这里，也不该被「恢复默认」碰到。
//
// sideWidth 是**右侧**面板的宽度百分比。默认 2:1 指的是「左编辑器 : 右面板」＝2:1，
// 也就是右面板占 1/3。
export const SETTINGS_DEFAULTS: Prefs = {
  indent: 2,
  fontSize: 15,
  showLineNums: false,
  sortMode: "off",
  sideWidth: 100 / 3,
};

export function clampSide(pct: number): number {
  return Math.min(SIDE_MAX, Math.max(SIDE_MIN, pct));
}

// 存下来的东西一律不可信：可能是旧版本写的、可能被人手改过、也可能是别的程序
// 用了同一个键。所以逐项验类型和取值范围，任何一项不认识就退回该项的默认值。
function sanitize(raw: unknown): Prefs {
  if (!raw || typeof raw !== "object") return { ...SETTINGS_DEFAULTS };
  const o = raw as Partial<Prefs> & { v?: number };
  // 版本对不上就整袋丢掉。宁可回到默认，也不要拿旧形状去猜新字段。
  if (o.v !== PREFS_V) return { ...SETTINGS_DEFAULTS };
  const oneOf = (v: unknown, allowed: number[], dflt: number) =>
    typeof v === "number" && allowed.indexOf(v) !== -1 ? v : dflt;
  return {
    indent: oneOf(o.indent, INDENT_STEPS, SETTINGS_DEFAULTS.indent),
    fontSize: oneOf(o.fontSize, FONT_SIZES, SETTINGS_DEFAULTS.fontSize),
    showLineNums: typeof o.showLineNums === "boolean" ? o.showLineNums : SETTINGS_DEFAULTS.showLineNums,
    sortMode: o.sortMode === "asc" || o.sortMode === "desc" || o.sortMode === "off" ? o.sortMode : SETTINGS_DEFAULTS.sortMode,
    // sideWidth 是连续量，不能要求它落在枚举里，夹进可拖范围就行。
    // 存的值可能来自旧版本（范围不一样），也可能被人手改过。
    sideWidth: clampSide(typeof o.sideWidth === "number" && isFinite(o.sideWidth) ? o.sideWidth : SETTINGS_DEFAULTS.sideWidth),
  };
}

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return { ...SETTINGS_DEFAULTS };
  try {
    const s = window.localStorage.getItem(PREFS_KEY);
    if (!s) return { ...SETTINGS_DEFAULTS };
    return sanitize(JSON.parse(s));
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ v: PREFS_V, ...p }));
  } catch {
    // 配额满、无痕模式等等。偏好没写进去不影响这次使用，也不是用户能处理的事，
    // 所以不弹提示——和 pushHistory 那边不同，那边丢了是丢数据，这边只是回到默认。
  }
}
