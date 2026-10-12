// 全局常量与示例数据。
// 改 TOAST_* 前先看 components/JsonTool.tsx 的 notify，改 HIST_* 前先看 pushHistory。
export const NL1 = String.fromCharCode(10);
export const BS = String.fromCharCode(92);
export const NL2 = NL1 + NL1;

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

// 示例自带的用法说明挂在哪个键上。抽成常量是因为有两个地方要用：
// SAMPLE 自己，以及 doSample 里把这一层默认展开的那句（不展开的话，
// 点完「示例」看到的只是一个收起来的 _用法 [5]，教程还得再点一下才看得见）。
export const SAMPLE_GUIDE_KEY = "_用法";

// 示例**不只是示例数据**：头一个键就是一段用法说明，点「示例」的人不用先跑去翻帮助面板。
// JSON 没有注释语法，教程只能以数据的形式待在里面，所以只能这么写。
// 后面那些字段是照界面挑的，一份数据把该演示的都演一遍：
// 嵌套对象（树 + 折叠）、数组（折叠收成一行）、中文（Unicode 转义）、
// null / 布尔 / 数字（值的配色）、一个像订单号的长字符串（换行折行）。
export const SAMPLE = JSON.stringify(
  {
    [SAMPLE_GUIDE_KEY]: [
      "① 工具栏的「格式化」按设置里的缩进重排，「压缩」把整篇收成一行，来回点两次就看出来了。",
      "② 右侧树形视图里：双击键名复制路径，双击值复制内容，行首 + / - 逐层展开。",
      "③ 行号左边的三角能把整个块收成一行：这 5 条会一起变成 [ … ]。",
      "④ 顶部搜索框同时搜树里的键值和输入框里的文字，回车跳下一个。",
      "⑤ 想留下现在这份内容就点工具栏的「保存」，它会进「保存记录」。",
    ],
    orderId: "SO-2026-1012-0087",
    status: "已发货",
    paid: true,
    customer: {
      name: "张伟",
      level: "黄金会员",
      contact: {
        phone: "138-0000-1234",
        email: "zhangwei@example.com",
      },
    },
    items: [
      { name: "机械键盘", price: 499, qty: 1, onSale: false, spec: { switch: "红轴", layout: "87 键" } },
      { name: "显示器支架", price: 159, qty: 2, onSale: true, spec: { material: "铝合金", load: "9 kg" } },
    ],
    shipping: {
      province: "浙江省",
      city: "杭州市",
      district: "西湖区",
      detail: "文三路 100 号 3 幢 502",
    },
    remark: null,
    totalAmount: 817,
  },
  null,
  2
);
