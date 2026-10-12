import type { ReactNode } from "react";

// 把 text 里所有命中 query 的片段包成 <mark>。大小写不敏感，query 为空时原样返回。
// 纯展示、无状态，所以从 JsonTool 里挪了出来——树和搜索框都用它。
//
// 编辑器那一层的黄块**不走这里**：它渲染的是 raw 的一个偏移量切片，见 JsonTool 的 highlightRaw。
export default function Highlight({ text, query, active }: { text: string; query: string; active?: boolean }) {
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
