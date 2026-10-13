// 输入框草稿的读写：**只有一个槽位**，存的就是编辑器上次离开时的正文。
//
// 为什么不并进 lib/prefs.ts 那个偏好袋子——三条理由，都很实在：
//   · 体积：正文可能上 MB，混进袋子之后每改一次设置都要把整篇跟着序列化一遍
//     （拖分栏时是每帧一次）；
//   · 语义：prefs 是「可以一键恢复默认的显示偏好」，草稿是**用户数据**，
//     和 jsontool.history 同类。「恢复默认」不该顺手删掉用户没另存过的东西；
//   · 版本：那边版本对不上会把**整袋**丢掉。袋子里躺着几百 KB 的字符串时，
//     「整袋丢掉」的代价就从「回到默认设置」变成「丢数据」了。
//
// **DRAFT_KEY 的值不能改**：改了等于所有人上次的内容被静默丢弃——和 HIST_KEY /
// PREFS_KEY 同一个道理，只是这个丢的还不在别处留底，丢了就是真没了。
//
// 本模块和 lib/ 其余模块一样：不引 React、不带状态。

export const DRAFT_KEY = "jsontool.draft";

// 存回去的上限。localStorage 每个站点总共只有几 MB，保存记录已经能吃掉
// HIST_MAX_CHARS（2MB），再留 1MB 给草稿，总量离配额还有点余量。
export const DRAFT_MAX_CHARS = 1024 * 1024;

// 写回去的防抖时长。比偏好的 PREFS_WRITE_MS（300ms）长：一次写的是整篇正文，
// 而且正文通常比偏好那五个数大得多。
export const DRAFT_WRITE_MS = 500;

// 值**直接存原文字符串，不套 JSON**。套一层 JSON.stringify 意味着上 MB 的正文要再
// 转义一遍（引号、换行全变成 \" \n），白占配额也白做一次全量扫描；而读回来本来
// 就是原样的字符串，压根不需要解析。
export function loadDraft(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(DRAFT_KEY) || "";
  } catch {
    return "";
  }
}

// 返回**是否写成功**，这点和 savePrefs 那个空 catch 不一样：偏好丢了只是回到默认，
// 这边丢的是用户没在别处存过的内容。调用方据此给一次提示，否则「没记住」会表现成
// 「有时候记得住、有时候记不住」这种最难查的样子。
// 空串走 removeItem：清空就是清空，不留一个空字符串占着键。
export function saveDraft(text: string): boolean {
  try {
    if (!text) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, text);
    return true;
  } catch {
    // 配额满、无痕模式等等。故意不在这里提示——这个函数是纯的，弹提示要经过
    // React 那边的 notify，由调用方决定。
    return false;
  }
}
