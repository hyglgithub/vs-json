import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const DEFAULT_ENDPOINT = "http://120.77.200.18:8787";
const MAX_AI_CHARS = 120000;

const ORGANIZE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "一句话概括这份 JSON 是什么数据" },
    structure: { type: "string", description: "整体结构说明：根类型、主要层级、数组元素形状" },
    fields: {
      type: "array",
      description: "重要字段的路径与含义，最多 30 条",
      items: {
        type: "object",
        properties: {
          path: { type: "string", description: "JSONPath，例如 $.data.list[].id" },
          meaning: { type: "string", description: "字段含义" },
          note: { type: "string", description: "补充说明，没有就填空字符串" },
        },
        required: ["path", "meaning", "note"],
      },
    },
    suspicious: {
      type: "array",
      description: "可疑点：命名不一致、类型混杂、疑似敏感信息、大量 null 或空数组",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          reason: { type: "string" },
        },
        required: ["path", "reason"],
      },
    },
    reorder: {
      type: "array",
      description: "建议的 key 排列顺序与理由，只给建议不改数据",
      items: { type: "string" },
    },
  },
  required: ["summary", "structure", "fields", "suspicious", "reorder"],
};

type OrganizeBody = {
  endpoint?: string;
  key?: string;
  json?: string;
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function trimSlash(input: string): string {
  let out = input;
  while (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

function buildPrompt(jsonText: string): string {
  return [
    "你是一名数据建模助手。用户会给你一份 JSON 数据，请分析它。",
    "只输出一个 JSON 对象，不要输出 markdown 围栏，不要输出任何其他字符。",
    "字段要求：",
    "- summary：一句话概括这份数据是什么。",
    "- structure：说明整体结构（根类型、层级、数组元素形状），不要逐字段罗列。",
    "- fields：列出重要字段的 JSONPath、含义与补充说明，最多 30 条，只挑有信息量的。",
    "- suspicious：指出命名不一致、类型混杂、疑似敏感信息（手机号、身份证、token、密码）、大量 null 或空数组等可疑点；没有就给空数组。",
    "- reorder：给出建议的 key 排列顺序与理由，只给建议，不要改写数据。",
    "JSON 数据：",
    jsonText,
  ].join(NL);
}

function findSessionId(value: unknown, depth: number): string | null {
  if (depth > 6 || value === null || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const cs = rec.chat_session;
  if (cs !== null && typeof cs === "object") {
    const id = (cs as Record<string, unknown>).id;
    if (typeof id === "string" && id) return id;
  }
  for (const key of Object.keys(rec)) {
    const found = findSessionId(rec[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function renderResult(value: unknown): string {
  if (value === null || typeof value !== "object") return String(value);
  const o = value as Record<string, unknown>;
  const out: string[] = [];
  if (typeof o.summary === "string" && o.summary) out.push("【概要】", o.summary, "");
  if (typeof o.structure === "string" && o.structure) out.push("【结构】", o.structure, "");
  const fields = Array.isArray(o.fields) ? o.fields : [];
  if (fields.length > 0) {
    out.push("【字段含义】");
    for (const item of fields) {
      const f = item as Record<string, unknown>;
      const note = typeof f.note === "string" && f.note ? "（" + f.note + "）" : "";
      out.push("- " + String(f.path) + "：" + String(f.meaning) + note);
    }
    out.push("");
  }
  const suspicious = Array.isArray(o.suspicious) ? o.suspicious : [];
  out.push("【可疑字段】");
  if (suspicious.length === 0) out.push("未发现明显问题");
  for (const item of suspicious) {
    const s = item as Record<string, unknown>;
    out.push("- " + String(s.path) + "：" + String(s.reason));
  }
  out.push("");
  const reorder = Array.isArray(o.reorder) ? o.reorder : [];
  if (reorder.length > 0) {
    out.push("【重排建议】");
    for (const r of reorder) out.push("- " + String(r));
  }
  return out.join(NL);
}

function sseFrame(payload: unknown): string {
  return "data: " + JSON.stringify(payload) + NL + NL;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: OrganizeBody;
  try {
    body = (await req.json()) as OrganizeBody;
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const key = (body.key || process.env.DEEPSEEK_API_KEY || "").trim();
  if (!key) return jsonError("缺少 DeepSeek 服务 key", 400);

  const base = trimSlash(body.endpoint || process.env.DEEPSEEK_ENDPOINT || DEFAULT_ENDPOINT);
  if (!base) return jsonError("AI 服务地址为空", 400);

  const raw = typeof body.json === "string" ? body.json : "";
  if (!raw.trim()) return jsonError("JSON 内容为空", 400);
  let jsonText = raw;
  if (jsonText.length > MAX_AI_CHARS) {
    jsonText = jsonText.slice(0, MAX_AI_CHARS) + NL + "（数据过长已截断，仅分析前半部分）";
  }

  const headers: Record<string, string> = {
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  };
  const signal = req.signal;

  let sid = "";
  try {
    const created = await fetch(base + "/api/v0/chat_session/create", {
      method: "POST",
      headers,
      body: "{}",
      signal,
    });
    const text = await created.text();
    if (!created.ok) {
      return jsonError("创建会话失败 " + created.status + "：" + text.slice(0, 400), 502);
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const found = parsed === null ? null : findSessionId(parsed, 0);
    if (!found) {
      return jsonError("创建会话响应里找不到 chat_session.id：" + text.slice(0, 400), 502);
    }
    sid = found;
  } catch (err) {
    return jsonError("创建会话请求失败：" + String(err), 502);
  }

  const completionBody = {
    prompt: buildPrompt(jsonText),
    chat_session_id: sid,
    thinking_enabled: false,
    search_enabled: false,
    model_type: "default",
    text: {
      format: {
        type: "json_schema",
        name: "organize_result",
        schema: ORGANIZE_SCHEMA,
      },
    },
  };

  let upstream: Response;
  try {
    upstream = await fetch(base + "/api/v0/chat/completion", {
      method: "POST",
      headers,
      body: JSON.stringify(completionBody),
      signal,
    });
  } catch (err) {
    return jsonError("请求 AI 服务失败：" + String(err), 502);
  }

  if (!upstream.ok || !upstream.body) {
    let detail = "";
    try {
      detail = (await upstream.text()).slice(0, 400);
    } catch {
      detail = "";
    }
    return jsonError("AI 服务返回 " + upstream.status + "：" + detail, 502);
  }
  const upstreamBody = upstream.body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(payload)));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          closed = true;
        }
      };

      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let cur: string | null = null;
      let failed = "";
      const acc: string[] = [];

      const handleFrame = (frame: Record<string, unknown>) => {
        if (frame.type === "error") {
          failed = typeof frame.content === "string" ? frame.content : "AI 服务返回错误";
          return;
        }
        const v = frame.v;
        const p = frame.p;
        const holder = v !== null && typeof v === "object" ? (v as Record<string, unknown>).response : null;
        const frags = holder !== null && typeof holder === "object" ? (holder as Record<string, unknown>).fragments : null;
        if (Array.isArray(frags)) {
          for (const item of frags) {
            const f = item as Record<string, unknown>;
            if (typeof f.type === "string") cur = f.type;
            if (cur === "RESPONSE" && typeof f.content === "string" && f.content) {
              acc.push(f.content);
              send({ t: "delta", v: f.content });
            }
          }
          return;
        }
        if (p === "response/fragments" && frame.o === "APPEND" && Array.isArray(v)) {
          for (const item of v) {
            const f = item as Record<string, unknown>;
            if (typeof f.type === "string") cur = f.type;
            if (cur === "RESPONSE" && typeof f.content === "string" && f.content) {
              acc.push(f.content);
              send({ t: "delta", v: f.content });
            }
          }
          return;
        }
        if (typeof v === "string" && v !== "FINISHED" && v !== "WIP") {
          const isContent = p === undefined || p === null || String(p).endsWith("/content");
          if (isContent && cur === "RESPONSE") {
            acc.push(v);
            send({ t: "delta", v });
          }
        }
      };

      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buf += decoder.decode(chunk.value, { stream: true });
          let idx = buf.indexOf(NL);
          while (idx !== -1) {
            let line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (line.endsWith(CR)) line = line.slice(0, -1);
            if (line.startsWith("data:")) {
              const payload = line.slice(5).trim();
              if (payload) {
                let frame: Record<string, unknown> | null = null;
                try {
                  frame = JSON.parse(payload) as Record<string, unknown>;
                } catch {
                  frame = null;
                }
                if (frame !== null) handleFrame(frame);
              }
            }
            if (failed) break;
            idx = buf.indexOf(NL);
          }
          if (failed) break;
        }
      } catch (err) {
        if (!failed) failed = "读取 AI 流失败：" + String(err);
      }

      if (failed) {
        send({ t: "error", v: failed });
        finish();
        return;
      }

      const text = acc.join("");
      if (!text.trim()) {
        send({ t: "error", v: "AI 没有返回内容" });
        finish();
        return;
      }
      let parsedResult: unknown = null;
      try {
        parsedResult = JSON.parse(text);
      } catch {
        parsedResult = null;
      }
      if (parsedResult === null) {
        send({ t: "done", v: text });
      } else {
        send({ t: "done", v: renderResult(parsedResult) });
      }
      finish();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
