// 面向显示的格式化：时间、体积、历史条目预览。全是纯函数。
export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

// 相对时间要传 now，不能在里面读 Date.now()——否则它只在重渲染时才变，
// 「刚刚」会一直挂着不动。调用方用一个每 30s 走一格的 now 驱动。
export function fmtRel(ts: number, now: number): string {
  const d = now - ts;
  if (d < 60000) return "刚刚";
  if (d < 3600000) return Math.floor(d / 60000) + " 分钟前";
  if (d < 86400000) return Math.floor(d / 3600000) + " 小时前";
  if (d < 30 * 86400000) return Math.floor(d / 86400000) + " 天前";
  return fmtTime(ts);
}

// 下载文件名里用的时间戳：YYYYMMDD-HHmmss。
// 不能复用 fmtTime——那个带 "/" 和空格，做文件名会被浏览器改写甚至截断。
// 存在的理由：下载名固定成 data.json 时，连下两次浏览器只会给你 data(1).json，
// 分不清哪份是哪份；带上秒级时间戳，每次下载天然不同名。
export function fmtFileStamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

export function fmtBytes(n: number): string {
  if (n < 1024) return n + " B";
  const kb = n / 1024;
  if (kb < 1024) return kb.toFixed(1).replace(/\.0$/, "") + " KB";
  return (kb / 1024).toFixed(2).replace(/\.00$/, "") + " MB";
}

// 历史列表里的正文：取开头一段，把换行和连续空白压成单个空格，
// 这样多行 JSON 也能一行读完（列表里本来就只给一行，末尾由 CSS 省略号收尾）。
export function histPreview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? flat.slice(0, 160) + "…" : flat;
}
