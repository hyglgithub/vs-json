// JSON 值的纯函数：类型判定、路径拼接、统计、排序、搜索。
// 这些函数不碰 React，也不碰组件状态——只是恰好长得像 UI 的一部分。
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type Match = { path: string; kind: string; text: string; literal: string; ancestors: string[] };


export function isObject(v: JsonValue): v is { [key: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function escapeKey(k: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? "." + k : "[" + JSON.stringify(k) + "]";
}

export function joinKey(base: string, key: string): string { return base + escapeKey(key); }

export function joinIndex(base: string, i: number): string { return base + "[" + i + "]"; }

export function valueClass(v: JsonValue): string {
  if (v === null) return "null";
  if (typeof v === "string") return "str";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  return "null";
}

export function computeStats(v: JsonValue): { nodes: number; depth: number } {
  if (Array.isArray(v)) {
    let nodes = 1;
    let depth = 0;
    for (const item of v) {
      const s = computeStats(item);
      nodes += s.nodes;
      if (s.depth > depth) depth = s.depth;
    }
    return { nodes, depth: depth + 1 };
  }
  if (isObject(v)) {
    let nodes = 1;
    let depth = 0;
    for (const k of Object.keys(v)) {
      const s = computeStats(v[k]);
      nodes += s.nodes;
      if (s.depth > depth) depth = s.depth;
    }
    return { nodes, depth: depth + 1 };
  }
  return { nodes: 1, depth: 0 };
}

export function collectPaths(v: JsonValue, path: string, acc: Set<string>): void {
  if (Array.isArray(v)) {
    acc.add(path);
    for (let i = 0; i < v.length; i++) collectPaths(v[i], joinIndex(path, i), acc);
    return;
  }
  if (isObject(v)) {
    acc.add(path);
    for (const k of Object.keys(v)) collectPaths(v[k], joinKey(path, k), acc);
    return;
  }
}

export function deepSort(v: JsonValue, desc = false): JsonValue {
  if (Array.isArray(v)) return v.map((item) => deepSort(item, desc));
  if (isObject(v)) {
    const out: { [key: string]: JsonValue } = {};
    const keys = Object.keys(v).sort();
    if (desc) keys.reverse();
    for (const k of keys) out[k] = deepSort(v[k], desc);
    return out;
  }
  return v;
}

export function findMatches(v: JsonValue, q: string, path: string, ancestors: string[], acc: Match[], limit: number): void {
  if (acc.length >= limit) return;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      findMatches(v[i], q, joinIndex(path, i), ancestors.concat([path]), acc, limit);
      if (acc.length >= limit) return;
    }
    return;
  }
  if (isObject(v)) {
    for (const k of Object.keys(v)) {
      const child = joinKey(path, k);
      if (k.toLowerCase().indexOf(q) !== -1) {
        acc.push({ path: child, kind: "key", text: k, literal: JSON.stringify(k), ancestors: ancestors.concat([path]) });
        if (acc.length >= limit) return;
      }
      findMatches(v[k], q, child, ancestors.concat([path]), acc, limit);
      if (acc.length >= limit) return;
    }
    return;
  }
  const s = v === null ? "null" : String(v);
  if (s.toLowerCase().indexOf(q) !== -1) acc.push({ path, kind: "value", text: s, literal: JSON.stringify(v), ancestors });
}

export type FoldRange = { closeLine: number; closeCol: number };

// 可折叠块扫描：返回「开括号所在行 → 闭括号的位置」，只保留**跨行**的块。行号从 0 开始。
// 除了闭括号所在行，还要给出它在该行的**列号**：折叠时整块要收成一行，
// 闭括号和它后面的逗号得原样接到开口行末尾（`"tags": […],`），
// 光知道行号没法从 `  }],` 里切出属于本块的那一段。
// 走纯文本扫描而不是复用 JSON.parse 的结果，是因为 AST 里根本没有行号，而折叠恰恰是按行操作的。
// 必须跳过字符串字面量里的括号（`{"a": "[{"}` 这种值里的括号不能算数），所以带了转义状态机。
// JSON 没有注释，因此不用处理注释；newline 上重置 esc 只是防御非法转义把状态带过行。
export function foldRanges(text: string): Map<number, FoldRange> {
  const NL = String.fromCharCode(10);
  const BS = String.fromCharCode(92);
  const DQ = String.fromCharCode(34);
  const LB = String.fromCharCode(123);
  const RB = String.fromCharCode(125);
  const LS = String.fromCharCode(91);
  const RS = String.fromCharCode(93);
  const out = new Map<number, FoldRange>();
  const stack: { line: number; col: number }[] = [];
  let line = 0;
  let lineStart = 0; // 行首在 text 里的下标，列号 = i - lineStart
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === NL) { line += 1; lineStart = i + 1; esc = false; continue; }
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === BS) { esc = true; continue; }
      if (c === DQ) inStr = false;
      continue;
    }
    if (c === DQ) { inStr = true; continue; }
    if (c === LB || c === LS) { stack.push({ line, col: i - lineStart }); continue; }
    if (c === RB || c === RS) {
      const open = stack.pop();
      if (open !== undefined && open.line < line) out.set(open.line, { closeLine: line, closeCol: i - lineStart });
    }
  }
  return out;
}
