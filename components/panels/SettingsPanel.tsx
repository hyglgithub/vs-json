import { FONT_SIZES, INDENT_STEPS } from "../../lib/prefs";
import type { SortMode } from "../../lib/prefs";
import Select from "../Select";

// 设置面板。结构照 VS Code 的设置页：**一项一块，标题 → 说明 → 控件，三者左对齐**。
// 外层**不用 <label>**：<label> 会把内部任何一次点击转发给它关联的控件，
// 而下拉弹层里的选项也在这一块里，点选项会连带把触发按钮再点一次、菜单立刻重新弹开。
// 改用 aria-label 给控件命名。
//
// 控件顺序：缩进 / Key 排序 / 字体大小 / 行号。前两项是**格式化·压缩那一组**的选项，
// 后两项是**编辑器显示**的偏好，所以挨着分成两段。任何按序号定位的脚本都依赖这个顺序。
//
// 每条说明都在两个地方各写了一份——这里的 .setting-desc，和 lib/help.ts 的「设置」一节。
// **两份谁都不 import 谁，改一处必须 grep 另一处。**「缩进在压缩时也生效」那句错话
// 就是两边一起错的。
export default function SettingsPanel(props: {
  indent: number;
  sortMode: SortMode;
  fontSize: number;
  showLineNums: boolean;
  onIndent: (n: number) => void;
  onSortMode: (m: SortMode) => void;
  onFontSize: (n: number) => void;
  onShowLineNums: (b: boolean) => void;
  onReset: () => void;
}) {
  const { indent, sortMode, fontSize, showLineNums, onIndent, onSortMode, onFontSize, onShowLineNums, onReset } = props;
  return (
    <div className="pane">
      <div className="pane-head">
        <span>设置</span>
        {/* 纯图标按钮才挂 data-tip，这个有文字，不加（见 CLAUDE.md 的提醒规矩） */}
        <button className="tool-btn set-reset" onClick={onReset}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5v5h5" /></svg>
          恢复默认
        </button>
      </div>
      <div className="settings">
        <div className="setting">
          <span className="setting-title">缩进</span>
          {/* 只对**格式化**有效：压缩走的是 reformatJson(raw, indent, false)，
              pretty 为假时 unit 是空串、也不插换行，indent 根本不参与。
              原来这句写的是「格式化与压缩时」，是错的。 */}
          <span className="setting-desc">格式化时每一层嵌套缩进几个空格。压缩会去掉全部缩进和换行。</span>
          <Select label="缩进" value={String(indent)} onChange={(v) => onIndent(Number(v))}
            options={INDENT_STEPS.map((n) => ({ value: String(n), label: n + " 空格" }))} />
        </div>
        {/* Key 排序 放在字体大小上面：它和缩进都是**格式化·压缩这一组**的选项，
            两项挨着；字体大小和行号则是**编辑器显示**的偏好，自己成一组。
            （组名是「格式化·压缩」，但缩进只对格式化生效，Key 排序才是两者都生效——
            别把组名当成「两项都影响两者」，那句错话就是这么来的。） */}
        <div className="setting">
          <span className="setting-title">Key 排序</span>
          <span className="setting-desc">格式化与压缩时，按键名重新排列各层级的字段。</span>
          <Select label="Key 排序" value={sortMode} onChange={(v) => onSortMode(v as SortMode)}
            options={[{ value: "off", label: "关闭" }, { value: "asc", label: "升序" }, { value: "desc", label: "降序" }]} />
        </div>
        <div className="setting">
          <span className="setting-title">字体大小</span>
          <span className="setting-desc">只作用于左侧输入框，含行号与折叠三角。</span>
          <Select label="字体大小" value={String(fontSize)} onChange={(v) => onFontSize(Number(v))}
            options={FONT_SIZES.map((n) => ({ value: String(n), label: n + " px" }))} />
        </div>
        <div className="setting">
          <span className="setting-title">行号</span>
          <label className="setting-check">
            <input type="checkbox" checked={showLineNums} onChange={(e) => onShowLineNums(e.target.checked)} />
            <span>在输入框左侧显示行号。关掉后折叠三角仍在，只是不再编号。</span>
          </label>
        </div>
      </div>
    </div>
  );
}
