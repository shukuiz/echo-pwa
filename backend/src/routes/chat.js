// 聊天转发：拼 System Prompt + 最近 20 条消息，流式转发 OpenAI 兼容接口的正文和推理字段
import { getConfig, authHeaders } from "../config.js";
import { buildSystemPrompt } from "../prompt.js";
import { paths, readJSON, writeJSON, uid, DATA_DIR } from "../storage.js";

const MAX_HISTORY = 20;

/** 归一化 base url：去掉末尾斜杠 */
const normBase = (u) => String(u || "").replace(/\/+$/, "");

/** 从 OpenAI / New API / Serein（FastAPI detail）风格的错误体里取出可读原因 */
function upstreamErrorMessage(text) {
  try {
    const j = JSON.parse(text);
    const m =
      j?.error?.message ??
      (typeof j?.detail === "string" ? j.detail : j?.detail?.message) ??
      j?.message ??
      (typeof j?.error === "string" ? j.error : "");
    return typeof m === "string" ? m.slice(0, 200) : "";
  } catch {
    return "";
  }
}

export default async function chatRoute(app) {
  // 读取历史聊天记录（供前端初始化）
  app.get("/api/chat/history", async () => {
    const chat = await readJSON(paths.chat(DATA_DIR), { messages: [] });
    return chat;
  });

  // 流式聊天。请求体：{ messages: [{role,text}], model? }
  // 新版客户端接收 NDJSON，旧版继续接收纯文本。
  app.post("/api/chat", async (req, reply) => {
    const cfg = await getConfig();
    if (!cfg.apiKey) {
      reply.code(400);
      return { error: "no_key", message: "后端还没有设置 API Key，请先到设置页保存" };
    }
    const base = normBase(cfg.proxyUrl);
    if (!/^https?:\/\//i.test(base)) {
      reply.code(400);
      return { error: "bad_base", message: "还没选择接口，或接口地址不是 http(s):// 开头" };
    }

    const body = req.body || {};
    const structured = body.streamFormat === "ndjson";
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const model = body.model || cfg.model;

    // 最近 20 条历史（含本次用户消息），映射为 OpenAI 消息格式
    const history = incoming.slice(-MAX_HISTORY).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.text ?? m.content ?? ""),
    }));

    const system = await buildSystemPrompt();
    const messages = [{ role: "system", content: system }, ...history];

    // 落盘：保存这次的用户消息到聊天记录
    try {
      const chat = await readJSON(paths.chat(DATA_DIR), { messages: [] });
      const lastUser = incoming[incoming.length - 1];
      if (lastUser && lastUser.role === "user") {
        chat.messages.push({ id: uid(), role: "user", text: lastUser.text, at: Date.now() });
        await writeJSON(paths.chat(DATA_DIR), chat);
      }
    } catch {}

    // 前端点「停止生成」或断网时，同步取消上游请求，避免网关继续生成并计费
    const upstreamAbort = new AbortController();
    const onClientClose = () => {
      if (!reply.raw.writableFinished) upstreamAbort.abort();
    };
    reply.raw.on("close", onClientClose);

    let upstream;
    try {
      upstream = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(cfg), // Key 仅在后端使用；Anthropic 额外带 workspace-id
        },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: upstreamAbort.signal,
      });
    } catch (e) {
      reply.raw.off("close", onClientClose);
      reply.code(502);
      return { error: "connect_failed", message: "连不上模型接口：" + e.message };
    }

    if (!upstream.ok || !upstream.body) {
      reply.raw.off("close", onClientClose);
      const detail = await upstream.text().catch(() => "");
      reply.code(upstream.status || 502);
      const reason = upstreamErrorMessage(detail);
      return {
        error: "upstream",
        message: `模型接口返回 ${upstream.status}${reason ? "：" + reason : ""}`,
        detail: detail.slice(0, 300),
      };
    }

    // 响应头延迟到第一段正文再发：开头就出错时还能返回带原因的错误码
    let headersSent = false;
    const sendHeaders = () => {
      if (headersSent) return;
      headersSent = true;
      reply.hijack();
      reply.raw.writeHead(200, {
        ...reply.getHeaders(),
        "Content-Type": structured ? "application/x-ndjson; charset=utf-8" : "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
    };

    // 从 SSE 中读取已公开的正文和推理增量。
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let reasoning = "";
    let streamError = "";

    const writeDelta = (type, text) => {
      sendHeaders();
      reply.raw.write(structured ? JSON.stringify({ type, text }) + "\n" : text);
    };

    const pushDelta = (data) => {
      // data 为单个 SSE 的 data: 载荷
      if (data === "[DONE]" || streamError) return;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        return; // 非 JSON 行忽略
      }
      // 网关在流中途下发的错误事件（如上游过载、额度用尽）
      if (json?.error) {
        streamError = upstreamErrorMessage(JSON.stringify(json)) || "模型接口在生成中途出错";
        return;
      }
      const event = json.choices?.[0]?.delta ?? json.choices?.[0]?.message;
      const thought = event?.reasoning_content ?? event?.reasoning;
      if (typeof thought === "string" && thought) {
        reasoning += thought;
        if (structured) writeDelta("reasoning", thought);
      }
      if (typeof event?.content === "string" && event.content) {
        fullText += event.content;
        writeDelta("content", event.content);
      }
    };

    let interrupted = false;
    try {
      while (!streamError) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          pushDelta(t.slice(5).trim());
        }
      }
      buffer += decoder.decode();
      if (!streamError && buffer.trim().startsWith("data:")) pushDelta(buffer.trim().slice(5).trim());
    } catch (e) {
      // 上游中断或前端停止：保留已收到的内容
      interrupted = true;
    } finally {
      reply.raw.off("close", onClientClose);
      if (streamError || interrupted) reader.cancel().catch(() => {});
    }

    const stopped = upstreamAbort.signal.aborted;
    if (streamError && !headersSent && !stopped) {
      // 还没输出正文：直接返回错误，前端显示原因并可重试
      reply.code(502);
      reply.send({ error: "upstream", message: streamError });
    } else if ((streamError || interrupted) && !stopped) {
      // 已输出部分正文：中断连接，让前端进入「失败可重试」而不是当成正常完成
      reply.raw.destroy(new Error(streamError || "upstream interrupted"));
    } else if (!reply.raw.destroyed) {
      sendHeaders();
      reply.raw.end();
    }

    // 落盘：保存助手完整回复
    try {
      if (fullText || reasoning) {
        const chat = await readJSON(paths.chat(DATA_DIR), { messages: [] });
        const status = stopped ? "stopped" : streamError || interrupted ? "error" : "done";
        chat.messages.push({ id: uid(), role: "echo", text: fullText, ...(reasoning ? { reasoning } : {}), at: Date.now(), status });
        await writeJSON(paths.chat(DATA_DIR), chat);
      }
    } catch {}
  });
}
