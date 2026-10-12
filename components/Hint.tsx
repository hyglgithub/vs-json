import { EMPTY_HINTS } from "../lib/help";

// 空态里的一句话提醒。文案在 lib/help.ts 的 EMPTY_HINTS 里，这儿只负责排版。
// **就一段灰字，没有标题、没有列表、没有「更多见帮助」**——空白面板上摆标题和条目
// 就是「分层」，用户看过之后要求去掉。手册在帮助面板，这里只管指路。
export default function Hint({ where }: { where: keyof typeof EMPTY_HINTS }) {
  return <p className="hint">{EMPTY_HINTS[where]}</p>;
}
