// 聊天转发：拼 System Prompt + 最近 20 条消息，流式转发 OpenAI 兼容接口的正文和推理字段
import { getConfig, authHeaders } from "../config.js";
import { buildSystemPrompt } from "../prompt.js";
import { paths, readJSON, writeJSON, uid, DATA_DIR } from "../storage.js";

const MAX_HISTORY = 20;
const MAX_DELETE = 500;
/** 前端生成的消息 id：只收短的安全字符，其它一律由后端生成 */
const clientId = (v) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);

/** 归一化 base url：去掉末尾斜杠 */
const normBase = (u) => String(u || "").replace(/\/+$/, "");
const plainText = (value) => typeof value === "string" ? value : "";

function chatDeltas(payload) {
  if (payload.type === "response.reasoning_summary_text.delta") return { thought: plainText(payload.delta) };
  if (payload.type === "response.output_text.delta") return { content: plainText(payload.delta) };
  if (payload.delta?.type === "thinking_delta") return { thought: plainText(payload.delta.thinking) };
  if (payload.delta?.type === "text_delta") return { content: plainText(payload.delta.text) };

  const choice = payload.choices?.[0];
  const event = choice?.delta ?? choice?.message;
  const parts = Array.isArray(event?.content) ? event.content : payload.candidates?.[0]?.content?.parts;
  const isThought = (part) => part?.thought === true || part?.type === "thinking" || part?.type === "reasoning";
  const thoughtParts = Array.isArray(parts)
    ? parts.filter(isThought).map((part) => plainText(part.thinking ?? part.text)).join("")
    : "";
  const details = Array.isArray(event?.reasoning_details)
    ? event.reasoning_details.map((part) => part?.type === "reasoning.summary" ? plainText(part.summary)
      : part?.type === "reasoning.text" ? plainText(part.text) : "").join("")
    : "";
  return {
    thought: details || plainText(event?.reasoning_content) || plainText(event?.reasoning) ||
      plainText(event?.thinking) || plainText(event?.reasoning_summary) || thoughtParts,
    content: plainText(event?.content) || (Array.isArray(parts)
      ? parts.filter((part) => !isThought(part)).map((part) => plainText(part?.text)).join("")
      : ""),
  };
}

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

  // 批量删除聊天记录 { ids: string[] }（多选删除 / 重新生成前删旧回复）
  app.delete("/api/chat/messages", { bodyLimit: 64 * 1024 }, async (req, reply) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_DELETE || !ids.every((id) => typeof id === "string" && id.length <= 64)) {
      reply.code(400);
      return { error: "bad_input", message: `ids 需要是 1–${MAX_DELETE} 个消息 id` };
    }
    const drop = new Set(ids);
    const chat = await readJSON(paths.chat(DATA_DIR), { messages: [] });
    const before = chat.messages.length;
    chat.messages = chat.messages.filter((m) => !drop.has(m.id));
    const deleted = before - chat.messages.length;
    if (deleted) await writeJSON(paths.chat(DATA_DIR), chat);
    return { ok: true, deleted };
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
    // 前端带上自己的消息 id，删除 / 重新生成时前后端才对得上；regenerate = 重新生成本轮，用户消息已在记录里
    const ids = body.ids && typeof body.ids === "object" ? body.ids : {};
    const userId = clientId(ids.user);
    const replyId = clientId(ids.echo);
    const regenerate = body.regenerate === true;
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const model = body.model || cfg.model;
    const useResponses = cfg.provider === "openai" && typeof model === "string" &&
      /^(?:gpt-[56](?:[.\-]|$)|o[134](?:-|$))/i.test(model) && !/-(?:chat|codex)(?:-|$)/i.test(model);

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
      if (lastUser && lastUser.role === "user" && !regenerate && !(userId && chat.messages.some((m) => m.id === userId))) {
        chat.messages.push({ id: userId || uid(), role: "user", text: lastUser.text, at: Date.now() });
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
      upstream = await fetch(`${base}${useResponses ? "/responses" : "/chat/completions"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(cfg), // Key 仅在后端使用；Anthropic 额外带 workspace-id
        },
        body: JSON.stringify(useResponses
          ? { model, input: messages, stream: true, reasoning: { summary: "auto" }, store: false }
          : { model, messages, stream: true }),
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
      if (json?.error || json?.type === "response.failed") {
        streamError = upstreamErrorMessage(JSON.stringify(json.response ?? json)) || "模型接口在生成中途出错";
        return;
      }
      if (!json || typeof json !== "object") return;
      const { thought, content } = chatDeltas(json);
      if (thought) {
        reasoning += thought;
        if (structured) writeDelta("reasoning", thought);
      }
      if (content) {
        fullText += content;
        writeDelta("content", content);
      }
    };

    let interrupted = false;
    try {
      const jsonResponse = upstream.headers.get("content-type")?.includes("application/json");
      while (!streamError) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (jsonResponse) continue;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          pushDelta(t.slice(5).trim());
        }
      }
      buffer += decoder.decode();
      if (!streamError && jsonResponse) pushDelta(buffer);
      else if (!streamError && buffer.trim().startsWith("data:")) pushDelta(buffer.trim().slice(5).trim());
    } catch (e) {
      // 上游中断或前端停止：保留已收到的内容
      interrupted = true;
    } finally {
      reply.raw.off("close", onClientClose);
      if (streamError || interrupted) reader.cancel().catch(() => {});
    }

    const stopped = upstreamAbort.signal.aborted;
    // 落盘：先保存助手完整回复再结束响应，前端拿到「完成」后立刻删除 / 重新生成也对得上
    try {
      if (fullText || reasoning) {
        const chat = await readJSON(paths.chat(DATA_DIR), { messages: [] });
        const status = stopped ? "stopped" : streamError || interrupted ? "error" : "done";
        const id = replyId && !chat.messages.some((m) => m.id === replyId) ? replyId : uid();
        chat.messages.push({ id, role: "echo", text: fullText, ...(reasoning ? { reasoning } : {}), at: Date.now(), status });
        await writeJSON(paths.chat(DATA_DIR), chat);
      }
    } catch {}
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

  });
}
