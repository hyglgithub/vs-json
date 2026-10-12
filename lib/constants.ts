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

export const SAMPLE = JSON.stringify(
  {
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
