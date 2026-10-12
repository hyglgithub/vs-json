// 纯字符串变换：Unicode 转义、反斜杠转义、按缩进重新排版。
// escapeUnicode / unescapeUnicode 是一对，别把它们再拆开。
export function escapeUnicode(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c > 0x7e) {
      if (c > 0xffff) {
        const h = Math.floor((c - 0x10000) / 0x400) + 0xd800;
        const l = ((c - 0x10000) % 0x400) + 0xdc00;
        out += "\\u" + h.toString(16).padStart(4, "0") + "\\u" + l.toString(16).padStart(4, "0");
      } else {
        out += "\\u" + c.toString(16).padStart(4, "0");
      }
    } else {
      out += ch;
    }
  }
  return out;
}

export function unescapeUnicode(s: string): string {
  const B = String.fromCharCode(92);
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s.charAt(i) === B && s.charAt(i + 1) === "u") {
      const hex = s.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
    }
    out += s.charAt(i);
    i += 1;
  }
  return out;
}

export function escapeText(s: string): string {
  const B = String.fromCharCode(92);
  const DQ = String.fromCharCode(34);
  const NL = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  const TAB = String.fromCharCode(9);
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (ch === B) out += B + B;
    else if (ch === DQ) out += B + DQ;
    else if (ch === NL || ch === CR || ch === TAB) out += ch;
    else if (c < 0x20) out += B + "u" + c.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out;
}

export function unescapeText(s: string): string {
  const B = String.fromCharCode(92);
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (ch === B && i + 1 < s.length) {
      const n = s.charAt(i + 1);
      if (n === "n") { out += String.fromCharCode(10); i += 2; continue; }
      if (n === "r") { out += String.fromCharCode(13); i += 2; continue; }
      if (n === "t") { out += String.fromCharCode(9); i += 2; continue; }
      if (n === "b") { out += String.fromCharCode(8); i += 2; continue; }
      if (n === "f") { out += String.fromCharCode(12); i += 2; continue; }
      if (n === "u") {
        const hex = s.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 6; continue; }
      }
      if (n === "x") {
        const hex = s.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 4; continue; }
      }
      out += n; i += 2; continue;
    }
    out += ch; i += 1;
  }
  return out;
}

export function reformatJson(text: string, indent: number, pretty: boolean): string {
  const BS = String.fromCharCode(92);
  const DQ = String.fromCharCode(34);
  const SP = String.fromCharCode(32);
  const NLc = String.fromCharCode(10);
  const TAB = String.fromCharCode(9);
  const CR = String.fromCharCode(13);
  const LB = String.fromCharCode(123);
  const RB = String.fromCharCode(125);
  const LS = String.fromCharCode(91);
  const RS = String.fromCharCode(93);
  const COM = String.fromCharCode(44);
  const COL = String.fromCharCode(58);
  const unit = pretty ? SP.repeat(indent) : String();
  const isWs = (c: string) => c === SP || c === TAB || c === NLc || c === CR;
  let out = String();
  let depth = 0;
  let i = 0;
  const n = text.length;
  const nl = () => {
    if (!pretty) return;
    out += NLc;
    let k = 0;
    while (k < depth) { out += unit; k += 1; }
  };
  while (i < n) {
    const ch = text.charAt(i);
    if (isWs(ch)) { i += 1; continue; }
    if (ch === DQ) {
      out += ch;
      i += 1;
      while (i < n) {
        const c = text.charAt(i);
        out += c;
        i += 1;
        if (c === BS) { if (i < n) { out += text.charAt(i); i += 1; } continue; }
        if (c === DQ) break;
      }
      continue;
    }
    if (ch === LB || ch === LS) {
      let j = i + 1;
      while (j < n && isWs(text.charAt(j))) j += 1;
      const closing = ch === LB ? RB : RS;
      if (text.charAt(j) === closing) { out += ch + closing; i = j + 1; continue; }
      out += ch;
      depth += 1;
      nl();
      i += 1;
      continue;
    }
    if (ch === RB || ch === RS) {
      depth -= 1;
      nl();
      out += ch;
      i += 1;
      continue;
    }
    if (ch === COM) { out += ch; nl(); i += 1; continue; }
    if (ch === COL) { out += pretty ? COL + SP : COL; i += 1; continue; }
    let j = i;
    while (j < n) {
      const c = text.charAt(j);
      if (isWs(c) || c === COM || c === LB || c === RB || c === LS || c === RS || c === COL) break;
      j += 1;
    }
    out += text.slice(i, j);
    i = j;
  }
  return out;
}
