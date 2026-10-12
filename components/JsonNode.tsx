import { isObject, joinIndex, joinKey, valueClass } from "../lib/json";
import type { JsonValue } from "../lib/json";
import Highlight from "./Highlight";

// 树的一行，递归自己。整个子树是**受控**的：展开集合、命中项、复制回调全部从上面传下来，
// 这里没有一个 useState。所以它能单独 import 出去复用——想换一套树的行样式，改这一个文件。
export type NodeProps = {
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

export default function JsonNode(props: NodeProps) {
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
