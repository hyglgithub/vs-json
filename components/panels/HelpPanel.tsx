import { HELP_SECTIONS } from "../../lib/help";

// 帮助面板 = 整篇教程。文案全部来自 lib/help.ts 的 HELP_SECTIONS，这里只负责排版；
// 三个空态各一句话，也在那个文件里。想改帮助里说的话，去改那个文件，别在这里加字符串。
export default function HelpPanel() {
  return (
    <div className="pane">
      <div className="pane-head">
        <span>帮助</span>
      </div>
      <div className="help">
        {HELP_SECTIONS.map((s) => (
          <div className="help-sec" key={s.id}>
            <span className="help-title">{s.title}</span>
            {s.items.map((t) => (
              <span className="help-line" key={t}>{t}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
