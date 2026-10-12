import type { CSSProperties, ReactNode, RefObject } from "react";

import type { FoldRange } from "../lib/json";
import Hint from "./Hint";

// 四层编辑器。**层叠关系一条都不能动**：
//   .editor-back   <pre>  纯文本，不透明底，撑开滚动高度
//   .editor-marks  <pre>  只画搜索命中的黄块
//   .editor-front  <textarea> 文字透明，它拿着光标、选区和全部输入
//   .editor-nums   <div>  行号 + 折叠三角，盖在最上面
// 之所以要四层而不是一层，是因为 textarea 没法给局部文字上色——命中标记只能另画一层。
// **绘制顺序和 DOM 顺序相反，由 z-index 决定**（0 / 1 / 2 / 3），改 JSX 顺序不起作用。
//
// 四层的盒子度量必须**逐像素一致**（字体、行高、padding、scrollbar-gutter 四项），
// 任何一项不同都会让光标和蓝色选区从文字上滑开。定稿前先量 clientWidth：
// 不一样就是病灶，scrollHeight 不一样只是症状。
//
// 这个组件不持有任何状态，连 ref 都是外面建的——因为 JsonTool 里还有别的 effect
// 要读同一批 ref（搜索滚动、折叠时反向推滚动位置），ref 只能是同一个对象。
export type EditorProps = {
  raw: string;
  onChange: (v: string) => void;
  /** 折叠后要显示的正文。没折叠时等于 raw。 */
  foldedText: string;
  /** 搜索命中层的内容；折叠期间传空串，理由见下面那段注释。 */
  highlightRaw: ReactNode;
  /** 折叠后**逐行**的内容来源。行号层和正文层必须同源，否则换行点会分叉。 */
  shown: { i: number; text: string }[];
  /** 可折叠块：开括号行号 → 闭括号位置。 */
  ranges: Map<number, FoldRange>;
  folded: Set<number>;
  folding: boolean;
  gutterShown: boolean;
  gutterOn: boolean;
  style: CSSProperties;
  /** 正文为空。空态提示只在这时为真。 */
  empty: boolean;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  backRef: RefObject<HTMLPreElement | null>;
  marksRef: RefObject<HTMLPreElement | null>;
  numsRef: RefObject<HTMLDivElement | null>;
  onToggleFold: (line: number) => void;
  onUnfold: () => void;
};

export default function Editor(props: EditorProps) {
  const { raw, onChange, foldedText, highlightRaw, shown, ranges, folded, folding, gutterShown, gutterOn, style, empty,
    editorRef, backRef, marksRef, numsRef, onToggleFold, onUnfold } = props;

  return (
    <div className={"editor-wrap" + (folding ? " folded" : "") + (gutterShown ? " guttered" : "")} style={style}>
      <pre className="editor-back" ref={backRef} aria-hidden="true">{foldedText}</pre>
      <textarea ref={editorRef} className="editor-front" value={raw} onChange={(e) => onChange(e.target.value)} onScroll={(e) => { const st = e.currentTarget.scrollTop; const sl = e.currentTarget.scrollLeft; const bk = backRef.current; if (bk) { bk.scrollTop = st; bk.scrollLeft = sl; } const mk = marksRef.current; if (mk) { mk.scrollTop = st; mk.scrollLeft = sl; } const nm = numsRef.current; if (nm) nm.scrollTop = st; }} spellCheck={false} aria-label="JSON 输入" />
      {/* 折叠期间不做搜索高亮：命中位置是按 raw 的偏移算的，折叠后行号已经重排，
          硬套上去只会画错地方。留空层是为了保住 ref，搜索滚动那个 effect 还要用它。 */}
      <pre className="editor-marks" ref={marksRef} aria-hidden="true">{folding ? "" : highlightRaw}</pre>
      {/* 行号层：`{s.text}` 是**透明的**，只用来把每个逻辑行撑到和编辑器里一样高，
          这样折行的续行不会让后面的号码往上跑。真正显示的只有绝对定位的 .num。
          它是第 4 层，和前三层不共享滚动——平时由 textarea 的 onScroll 推，
          折叠时（textarea 已不可交互）反过来由它自己推给另外两层。 */}
      {gutterShown && (
        <div className="editor-nums" ref={numsRef} aria-hidden="true"
          onClick={() => { if (folding) onUnfold(); }}
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
                  onClick={(e) => { e.stopPropagation(); onToggleFold(s.i); }}>
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
      {empty && (
        <div className="editor-empty" aria-hidden="true">
          <Hint where="editor" />
        </div>
      )}
    </div>
  );
}
