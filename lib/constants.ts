// 全局常量与示例数据。
// 改 TOAST_* 前先看 components/JsonTool.tsx 的 notify，改 HIST_* 前先看 pushHistory。
export const NL1 = String.fromCharCode(10);
export const BS = String.fromCharCode(92);

export const TOAST_MS = 3000; // 消息提示自动消失（对齐 ElMessage 的 duration 默认值）
export const TOAST_OUT_MS = 200; // 退场动画时长，**必须与 CSS 里 toast-out 的 duration 一致**
export const TOAST_MAX = 5; // 同屏最多几条（活跃条数，退场中的不计入）

// 消息类型，对齐 Element Plus 的 ElMessage：五型各有图标与配色。
// 颜色全部取自项目已有的 CSS 变量，不新增色板。
export type ToastKind = "primary" | "success" | "info" | "warning" | "error";

export const HIST_KEY = "jsontool.history";
export const HIST_MAX = 60; // 条数上限
export const HIST_MAX_CHARS = 2 * 1024 * 1024; // 总字符上限：localStorage 配额只有几 MB，不裁会静默写失败

export type HistoryEntry = { id: number; ts: number; text: string };

// 示例**整个就是教程**。
//
// 早先的版本前半段是用法说明、后半段是一份订单数据（orderId / customer / items …），
// 用户的原话是「后半部分是垃圾，给我换成教程」——那份假数据除了占地方没有任何作用，
// 而点「示例」的人本来就是来看这份工具怎么用的。
//
// 现在的结构分两块，都有用：
//   · 教程     —— 十条，一条一个功能，就是帮助面板那份手册的浓缩版
//   · 这份数据 —— 几个字段专门用来演示值的显示与折叠（嵌套、数组、null、布尔）
// 后一块不是凑数：没有它，整个示例没有任何嵌套，树形视图和折叠就没有东西可演。
//
// JSON 没有注释语法，教程只能以数据的形式待在文件里，所以只能这么写。
// 序号用「1.」这种普通写法，不用 ①②③——用户明确要求换掉。
export const SAMPLE = JSON.stringify(
  {
    说明: "这份示例本身就是教程，可以直接拿它试各种操作。",
    教程: [
      "1. 输入：粘贴 JSON，或把 .json 文件拖入窗口，也可以点工具栏的上传按钮。",
      "2. 格式化：点「格式化」按设置中的缩进展开；点「压缩」去除全部缩进与换行，输出为单行。",
      "3. Key 排序：「设置 → Key 排序」启用后，格式化与压缩都会按键名重排各层级的字段。",
      "4. 树形视图：行首的 + / - 逐层展开，双击键名复制该节点的路径，双击值复制其内容。",
      "5. 搜索：搜索框同时匹配树中的键值与输入框中的原文，回车跳转下一处，Esc 清空。",
      "6. 折叠：点行号左侧的三角把整个块收成一行，数组会显示为 [ … ]。",
      "7. 行号：「设置 → 行号」只关闭行号，折叠三角仍然保留。",
      "8. Unicode 与转义：工具栏两个菜单负责中文与特殊字符的互转、以及反斜杠转义的添加与去除。",
      "9. 保存记录：点工具栏的「保存」把当前内容存进「保存记录」，点条目可以载回输入框。",
      "10. 上传与下载：上传用于读取 .json 文件；下载的文件名带时间戳，多次下载不会互相覆盖。",
    ],
    这份数据: {
      说明: "上面是教程，这里用几个字段演示值的显示方式与折叠。",
      字符串: "中文、符号与转义都能正常显示",
      数字: 2026,
      布尔: true,
      空值: null,
      数组: ["数组的元素个数显示在方括号里", "点行号左侧的三角可以把整组收起来"],
      嵌套对象: {
        第一层: {
          第二层: "层级越深，树形视图里的缩进越多",
        },
      },
    },
  },
  null,
  2
);
