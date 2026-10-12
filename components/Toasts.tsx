import type { ReactNode } from "react";
import type { ToastKind } from "../lib/constants";

export type Toast = { id: number; text: string; kind: ToastKind; leaving: boolean };

// 每种消息类型一个图标。primary 和 info 同用 ⓘ（Element 也是这样，只有颜色不同）。
function toastIcon(kind: ToastKind): ReactNode {
  if (kind === "success") {
    return <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.4l2.6 2.6L16 9.6" /></svg>;
  }
  if (kind === "warning") {
    return <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l9 16H3z" /><path d="M12 10v4.5" /><path d="M12 17.6h.01" /></svg>;
  }
  if (kind === "error") {
    return <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6" /><path d="M9 9l6 6" /></svg>;
  }
  return <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.6h.01" /></svg>;
}

// 消息气泡栈。**只管画，不管计时**——什么时候来、什么时候走全在 JsonTool 的
// notify / dropToast 里，这里收到的每一条都已经决定好要不要播退场动画了。
//
// 放在 .app 最后一个子元素即可：position:fixed 脱离文档流，不参与 .app 的 flex 布局，
// 也无需 portal。容器 pointer-events:none、每条 auto，否则右下角那个透明盒子会吃掉点击。
export default function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {/* 只有点 × 才关得掉，点气泡正文不做任何事（对齐 ElMessage 的行为）。
          × 上也不挂 data-tip：气泡贴在视口右下角，提示框会被视口边缘裁掉。 */}
      {toasts.map((t) => (
        <div className={"toast " + t.kind + (t.leaving ? " leaving" : "")} key={t.id}>
          {toastIcon(t.kind)}
          <span className="toast-text">{t.text}</span>
          <button className="toast-x" onClick={() => onDismiss(t.id)} aria-label="关闭">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
