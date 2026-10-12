import type { JsonValue } from "../../lib/json";
import Hint from "../Hint";
import JsonNode from "../JsonNode";

// 树形视图面板。整棵树的展开状态、命中项、复制回调全从 JsonTool 传进来——
// 这里不持有状态，改这个文件改的是「树这一屏长什么样」，不是它的行为。
export default function TreePanel(props: {
  ready: boolean;
  tooBig: boolean;
  empty: boolean;
  value: JsonValue;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  query: string;
  activePath: string;
  registerRef: (path: string, el: HTMLDivElement | null) => void;
  onCopyPath: (path: string) => void;
  onCopyValue: (value: JsonValue) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const { ready, tooBig, empty, value, expanded, onToggle, query, activePath, registerRef, onCopyPath, onCopyValue, onExpandAll, onCollapseAll } = props;
  return (
    <div className="pane">
      <div className="pane-head">
        <span>树形视图</span>
        <div className="tree-actions">
          <button className="tool-btn" onClick={onExpandAll}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8" /><path d="M8 12h8" /></svg>
            全展开
          </button>
          <button className="tool-btn" onClick={onCollapseAll}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 12h8" /></svg>
            全折叠
          </button>
        </div>
      </div>
      <div className="tree">
        {ready && !tooBig && <JsonNode label="$" value={value} path="$" depth={0} expanded={expanded} onToggle={onToggle} query={query} activePath={activePath} registerRef={registerRef} onCopyPath={onCopyPath} onCopyValue={onCopyValue} />}
        {ready && tooBig && <div className="pad muted">数据超过 5MB，未渲染树</div>}
        {!ready && !empty && <div className="pad muted">修复 JSON 后显示结构</div>}
        {empty && <div className="pad"><Hint where="tree" /></div>}
      </div>
    </div>
  );
}
