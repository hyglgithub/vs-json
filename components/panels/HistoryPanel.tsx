import type { HistoryEntry } from "../../lib/constants";
import { fmtBytes, fmtRel, fmtTime, histPreview } from "../../lib/format";
import Hint from "../Hint";

// 保存记录面板。**只读**：点条目是把它载回编辑框，没有就地编辑，也不该加。
export default function HistoryPanel(props: {
  history: HistoryEntry[];
  /** 当前时间，用来算「刚刚 / N 分钟前」。由 JsonTool 的 30s 走时器推着走。 */
  now: number;
  onRestore: (h: HistoryEntry) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
}) {
  const { history, now, onRestore, onRemove, onClear } = props;
  return (
    <div className="pane">
      <div className="pane-head">
        <span>保存记录（{history.length}条）</span>
        <button className="tool-btn hist-clear" onClick={onClear}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>清空记录</button>
      </div>
      <div className="tree">
        {/* 两个上限写在这节提示的最后一条里（数字由 HIST_MAX / HIST_MAX_CHARS 算出来）。
            以前这里另有一行小字重复说上限，数字还是手抄的，和常量一改就对不上——
            现在只此一处。 */}
        {history.length === 0 && <div className="pad"><Hint where="history" /></div>}
        {history.map((h) => (
          <div className="hist-row" key={h.id}>
            <button className="hist-main" onClick={() => onRestore(h)}>
              <span className="hist-line1">
                <span className="hist-rel">{fmtRel(h.ts, now)}</span>
                <span className="hist-meta">{fmtTime(h.ts)} · {fmtBytes(h.text.length)}</span>
              </span>
              <span className="hist-prev">{histPreview(h.text)}</span>
            </button>
            <button className="hist-del" onClick={() => onRemove(h.id)} data-tip="删除" aria-label="删除">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
