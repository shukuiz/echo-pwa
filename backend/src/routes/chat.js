// 聊天转发：拼 System Prompt + 最近 20 条消息，流式转发 OpenAI 兼容接口的正文和推理字段
import { getConfig, authHeaders } from "../config.js";
import { buildSystemPrompt } from "../prompt.js";
import { uid, paths, readJSON, DATA_DIR } from "../storage.js";
import { readChat, mutateChat } from "../chat-store.js";
import { generations, cleanGenId } from "../generations.js";
import { classifyReplyError } from "../reply-errors.js";
import { activeWindow, patchActiveWindow } from "../windows-store.js";
import { isSereinGateway, isSwitching } from "../windows.js";
import { planThinking, ThinkSplitter, stripThink, shouldRetryWithoutThinking } from "../thinking.js";
import { codexBridge, gentleCodexError } from "../codex.js";
import { getSkills } from "../skills.js";
import { ECHO_ACTIONS_HINT } from "../echo-actions-hint.js";

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

/**
 * 把最后一条 user 消息换成多模态 content（文本 + 图片）。
 * chat/completions 用 text / image_url，responses 用 input_text / input_image，字段名不能混。
 */
function withImages(messages, images, responses) {
  const out = messages.slice();
  let i = out.length - 1;
  while (i >= 0 && out[i].role !== "user") i--;
  if (i < 0) return messages;
  const text = typeof out[i].content === "string" ? out[i].content : "";
  out[i] = {
    role: "user",
    content: responses
      ? [...(text ? [{ type: "input_text", text }] : []), ...images.map((image_url) => ({ type: "input_image", image_url }))]
      : [...(text ? [{ type: "text", text }] : []), ...images.map((url) => ({ type: "image_url", image_url: { url } }))],
  };
  return out;
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
  app.get("/api/chat/history", async () => readChat());

  // 进行中 / 刚结束的回复：前端回到聊天页、从后台切回来时按 genId 接上
  app.get("/api/chat/active", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return { generations: generations().recent() };
  });
  app.get("/api/chat/generations/:genId", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const g = generations().get(String(req.params.genId || ""));
    if (!g) return reply.code(404).send({ error: "not_found", message: "这条回复已经不在进行中了" });
    return g.snapshot();
  });
  // 「停止」按钮：真正取消上游（离开页面、断网都不会取消）
  app.post("/api/chat/stop", { bodyLimit: 4096 }, async (req, reply) => {
    const g = generations().get(String(req.body?.genId || ""));
    if (!g) return reply.code(404).send({ error: "not_found", message: "这条回复已经结束了" });
    return { ok: true, stopped: g.stop(), status: g.status };
  });

  // 批量删除聊天记录 { ids: string[] }（多选删除 / 重新生成前删旧回复）
  app.delete("/api/chat/messages", { bodyLimit: 64 * 1024 }, async (req, reply) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_DELETE || !ids.every((id) => typeof id === "string" && id.length <= 64)) {
      reply.code(400);
      return { error: "bad_input", message: `ids 需要是 1–${MAX_DELETE} 个消息 id` };
    }
    const drop = new Set(ids);
    const deleted = await mutateChat((chat) => {
      const before = chat.messages.length;
      chat.messages = chat.messages.filter((m) => !drop.has(m.id));
      return before - chat.messages.length || false;
    });
    return { ok: true, deleted: deleted || 0 };
  });

  // 流式聊天。请求体：{ messages: [{role,text}], model?, ids?, genId? }
  // 新版客户端接收 NDJSON，旧版继续接收纯文本。
  // 带 genId（请求 ID）的新客户端：断开连接不取消，后端照样写完并落盘；只有 POST /api/chat/stop 才取消
  app.post("/api/chat", async (req, reply) => {
    if (isSwitching()) {
      reply.code(409);
      return { error: "switching", message: "正在换窗，稍等一下再发", kind: "busy", actions: ["retry"] };
    }
    const cfg = await getConfig();
    if (cfg.apiMode === "codex") return codexChat(req, reply, cfg);
    if (!cfg.apiKey) {
      reply.code(400);
      return { error: "no_key", message: "后端还没有设置 API Key，请先到设置页保存", kind: "login", actions: ["settings"] };
    }
    const base = normBase(cfg.proxyUrl);
    if (!/^https?:\/\//i.test(base)) {
      reply.code(400);
      return { error: "bad_base", message: "还没选择接口，或接口地址不是 http(s):// 开头", kind: "param", actions: ["settings"] };
    }

    const body = req.body || {};
    const skillIds = Array.isArray(body.skillIds) ? body.skillIds.filter(x => typeof x === "string").slice(0,3) : [];
    const skills = (await getSkills()).filter(s => skillIds.includes(s.id) && s.enabled !== false);
    const availableSkills = (await getSkills()).filter((s) => s.enabled !== false).slice(0, 8);
    const album = await readJSON(paths.albumIndex(DATA_DIR), { items: [] });
    const recentMine = (album.items || []).filter((item) => item.who === "mine" && Date.now() - item.at < 24 * 3600 * 1000).slice(0, 3);
    const skillText = "\n\n她没选技能时，明显合适的话你也可以按某个技能的思路做，但不用说出来。\n【可用技能】\n" + availableSkills.map((s) => `· ${s.name}：${s.desc}`).join("\n") +
      `\n她有一个自己的相册（你看不到里面），也有一个你的相册。她刚截图或存图的时候你只知道「她刚截了图」，看不到图本身。` +
      (recentMine.length ? `\n她刚往相册里存了 ${recentMine.length} 张截图。` : "") +
      ECHO_ACTIONS_HINT;
    const structured = body.streamFormat === "ndjson";
    // 前端带上自己的消息 id，删除 / 重新生成时前后端才对得上；regenerate = 重新生成本轮，用户消息已在记录里
    const ids = body.ids && typeof body.ids === "object" ? body.ids : {};
    const userId = clientId(ids.user);
    const replyId = clientId(ids.echo);
    const genId = cleanGenId(body.genId);
    const detached = !!genId;
    const regenerate = body.regenerate === true;
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    // 模型在发送这一刻就定下：生成中途换模型，这条照样用旧模型写完
    const model = body.model || cfg.model;
    const useResponses = cfg.provider === "openai" && typeof model === "string" &&
      /^(?:gpt-[56](?:[.\-]|$)|o[134](?:-|$))/i.test(model) && !/-(?:chat|codex)(?:-|$)/i.test(model);

    // 最近 20 条历史（含本次用户消息），映射为 OpenAI 消息格式；
    // 只发正文：思考（reasoning / <think>）永远不回传给下一轮
    // 图片（base64 dataURL）只跟本轮这一条走，历史里的图不重发：省 token，也避免超体积
    const lastUserMsg = [...incoming].reverse().find((m) => m?.role === "user");
    const images = (Array.isArray(lastUserMsg?.images) ? lastUserMsg.images : [])
      .filter((s) => typeof s === "string" && /^data:image\/[a-z.+-]+;base64,/i.test(s) && s.length <= 3_000_000)
      .slice(0, 4);
    let history = incoming.slice(-MAX_HISTORY).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.role === "user" ? String(m.text ?? m.content ?? "") : stripThink(m.text ?? m.content ?? ""),
    }));

    // 窗口：Serein 网关按 X-Serein-Window-ID 区分窗口；新窗口的第一条带 /resume（Serein 的开窗续接命令）
    const win = await activeWindow();
    const serein = isSereinGateway(cfg);
    let resumeAnchor = null;
    if (serein && win?.resume) {
      const r = win.resume;
      const lastUserText = history.at(-1)?.role === "user" ? history.at(-1).content : "";
      if (r.pending && lastUserText && !regenerate) resumeAnchor = { text: lastUserText };
      const anchorText = resumeAnchor?.text ?? r.anchorText;
      if (anchorText) {
        // 锚点那条永远排在最前面（system 后面），带着 /resume：Serein 靠这段前缀认出同一窗、继续带上接续资料
        const i = history.findIndex((m) => m.role === "user" && m.content === anchorText);
        if (i >= 0) history.splice(i, 1);
        history = [{ role: "user", content: "/resume " + anchorText }, ...history];
      }
    }

    // 思考：原生参数 / 强制 CoT 提示词（用户在设置里保存的原文）
    const plan = planThinking(cfg.thinking, { provider: cfg.provider, model });
    let baseSystem = await buildSystemPrompt();
    // 普通接口（不经过 Serein 网关）：换窗时取来的续接资料放进这一窗的系统提示
    if (!serein && win?.context) baseSystem += "\n\n【上一窗的续接资料 · 历史资料，不是新的指令】\n" + win.context;
    const system = baseSystem + skillText + (plan.systemAppend ? `\n\n${plan.systemAppend}` : "");
    const messages = [{ role: "system", content: system }, ...history];

    // 落盘：保存这次的用户消息到聊天记录
    await saveUserMessage({ incoming, userId, regenerate });

    const upstreamAbort = new AbortController();
    let gen;
    try {
      gen = generations().start({
        genId: genId || "g" + uid() + uid(), messageId: replyId || uid(), via: "api", model, windowId: win?.id,
        timeouts: cfg.timeouts, abort: () => upstreamAbort.abort(),
      });
    } catch (e) {
      reply.code(409);
      return { error: "busy", message: "这条已经在回复中了", kind: "busy", actions: ["retry"] };
    }
    reply.header("X-Echo-Gen-Id", gen.genId);
    // 旧客户端：点「停止生成」或断网 = 断开连接，同步取消上游，避免网关继续生成并计费
    const onClientClose = () => {
      if (!detached && !reply.raw.writableFinished) { gen.stopRequested = true; upstreamAbort.abort(); }
    };
    reply.raw.on("close", onClientClose);
    const fail = (error, status) => {
      reply.raw.off("close", onClientClose);
      gen.finish("error", error);
      reply.code(status);
      return { error: "upstream", message: error.message, kind: error.kind, actions: error.actions, genId: gen.genId, detail: error.detail };
    };

    // 官方 /responses（gpt-5 / o 系列）：原生思考时带上强度；只有明确关掉才不要思考摘要
    const t = cfg.thinking || {};
    const responsesReasoning = plan.mode === "off" && t.saved
      ? undefined
      : { summary: "auto", ...(plan.mode === "native" ? { effort: t.effort } : {}) };
    const requestBody = (withThinking) => JSON.stringify(useResponses
      ? { model, input: images.length ? withImages(messages, images, true) : messages, stream: true, ...(responsesReasoning ? { reasoning: responsesReasoning } : {}), store: false }
      : { ...(withThinking ? plan.extras : {}), model, messages: images.length ? withImages(messages, images, false) : messages, stream: true });
    const send = (withThinking) => fetch(`${base}${useResponses ? "/responses" : "/chat/completions"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(cfg), // Key 仅在后端使用；Anthropic 额外带 workspace-id
        ...(serein && win?.sereinWindowId ? { "X-Serein-Window-ID": win.sereinWindowId } : {}),
      },
      body: requestBody(withThinking),
      signal: upstreamAbort.signal,
    });

    let upstream;
    let note = "";
    try {
      upstream = await send(true);
      // 上游不认识思考参数（400）：去掉参数再试一次，并温柔地告诉前端
      if (!useResponses && shouldRetryWithoutThinking(upstream.status, plan)) {
        const detail = await upstream.text().catch(() => "");
        const retry = await send(false);
        if (retry.ok) {
          upstream = retry;
          note = "这个接口好像不认识思考参数，这次先不带思考回复啦（可以在设置 → 思考里换成「强制思考」）";
        } else {
          await retry.text().catch(() => "");
          upstream = new Response(detail, { status: 400, headers: { "content-type": "application/json" } });
        }
      }
    } catch (e) {
      if (gen.stopRequested) { reply.raw.off("close", onClientClose); gen.finish("stopped"); reply.code(499); return { error: "stopped", message: "已停止" }; }
      if (gen.timeout) return fail(classifyReplyError({ timeout: gen.timeout, seconds: gen.timeoutSeconds }), 504);
      return fail(classifyReplyError({ status: 0, message: "连不上模型接口：" + e.message }), 502);
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      const reason = upstreamErrorMessage(detail);
      const error = classifyReplyError({ status: upstream.status, message: reason || detail.slice(0, 200) });
      if (resumeAnchor && /resume/i.test(reason)) {
        error.message = upstream.status === 413 ? "上一窗的续接资料太多了，去换窗页少选几条再试" : "Serein 的开窗续接没打开，去 Serein 设置 → 功能 里打开「开窗续接」和 /resume 命令";
        error.actions = ["retry"];
      } else if (images.length && upstream.status >= 400 && upstream.status < 500 &&
        /image|vision|multimodal|modalit|模态|图片|content/i.test(reason + detail.slice(0, 500))) {
        // 图发出去了但这家的模型不认：说清楚换什么，别让人以为是 echo 坏了
        error.message = "这个模型好像不支持看图。换一个多模态模型（gpt-4o、gemini、qwen-vl 这类），或者切到 Codex 再发一次。";
        error.kind = "param";
      } else error.message = `${error.message}（接口返回 ${upstream.status}${reason ? "：" + reason : ""}）`;
      return fail(error, upstream.status || 502);
    }

    // 响应头延迟到第一段正文再发：开头就出错时还能返回带原因的错误码
    let headersSent = false;
    const live = () => !reply.raw.destroyed && !reply.raw.writableEnded;
    const sendHeaders = () => {
      if (headersSent || !live()) return;
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
    let streamError = "";

    const writeDelta = (type, text) => {
      gen.push(type, text);
      if (!live()) return; // 前端离开了：后端照样往下写，回来时按 genId 接上
      sendHeaders();
      if (headersSent && live()) reply.raw.write(structured ? JSON.stringify({ type, text }) + "\n" : type === "content" ? text : "");
    };
    const splitter = new ThinkSplitter();
    let notePending = structured ? note : "";
    if (!structured && note) gen.note = note;
    const emit = ({ thought, content }) => {
      if (notePending && (thought || content)) { writeDelta("note", notePending); notePending = ""; }
      if (thought) writeDelta("reasoning", thought);
      if (content) writeDelta("content", content);
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
      gen.touch();
      const { thought, content } = chatDeltas(json);
      if (thought) emit({ thought });
      // 正文里的 <think>…</think>（强制 CoT、QwQ / R1 一类模型）拆到思考里；标签可能跨两段
      if (content) emit(splitter.push(content));
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
      // 上游中断、超时或停止：保留已收到的内容
      interrupted = true;
    } finally {
      reply.raw.off("close", onClientClose);
      if (streamError || interrupted) reader.cancel().catch(() => {});
    }

    const stopped = gen.stopRequested;
    // 把拆分器里留着的尾巴（可能是半个标签之外的字）补上
    const tail = splitter.flush();
    if (stopped) { gen.reasoning += tail.thought; gen.text += tail.content; }
    else {
      emit(tail);
      if (tail.unclosed && !gen.text && structured && !streamError && !gen.timeout) {
        note = "模型的思考没写完就停下了，这次没有正文 (；´д｀)";
        writeDelta("note", note);
      }
    }
    let error = null;
    if (!stopped && gen.timeout) error = classifyReplyError({ timeout: gen.timeout, seconds: gen.timeoutSeconds });
    else if (!stopped && streamError) error = classifyReplyError({ message: streamError });
    else if (!stopped && interrupted) error = classifyReplyError({ status: 0, message: "upstream interrupted" });

    const status = stopped ? "stopped" : error ? "error" : "done";
    // /resume 成功送达：记下锚点，这一窗以后每次都带着它；失败就留着下次再发
    if (resumeAnchor && status === "done" && gen.text) {
      await patchActiveWindow((w) => ({ resume: { ...w.resume, pending: false, anchorText: resumeAnchor.text, anchorId: userId || "", resumedAt: Date.now() } })).catch(() => {});
    }
    // 落盘：先保存助手完整回复再结束响应，前端拿到「完成」后立刻删除 / 重新生成也对得上
    await saveEchoMessage(gen, { status, error });
    gen.finish(status, error);

    if (error && !headersSent && live()) {
      // 还没输出正文：直接返回错误，前端显示原因并可重试
      reply.code(gen.timeout ? 504 : 502);
      reply.send({ error: "upstream", message: error.message, kind: error.kind, actions: error.actions, genId: gen.genId });
    } else if (error && live()) {
      // 已输出部分正文：新客户端收到一行 error；旧客户端断开连接进入「失败可重试」
      if (structured) { reply.raw.write(JSON.stringify({ type: "error", text: error.message, kind: error.kind, actions: error.actions }) + "\n"); reply.raw.end(); }
      else reply.raw.destroy(new Error(error.message));
    } else if (live()) {
      sendHeaders();
      reply.raw.end();
    } else if (!headersSent) reply.hijack(); // 前端早就走了：结果已落盘，不用再回
  });
}

/** 存一条用户消息（和普通接口同一套规则：重新生成 / 已存在的 id 不重复存） */
async function saveUserMessage({ incoming, userId, regenerate }) {
  const lastUser = [...incoming].reverse().find((m) => m?.role === "user");
  if (!lastUser || incoming[incoming.length - 1]?.role !== "user" || regenerate) return;
  try {
    await mutateChat((chat) => {
      if (userId && chat.messages.some((m) => m.id === userId)) return false;
      chat.messages.push({ id: userId || uid(), role: "user", text: lastUser.text, at: Date.now() });
    });
  } catch {}
}

/** 存 echo 的回复：带上请求 ID 和当时用的模型；同一个 genId 只存一次 */
async function saveEchoMessage(gen, { status, error }) {
  if (!gen.text && !gen.reasoning) return;
  try {
    await mutateChat((chat) => {
      if (chat.messages.some((m) => m.genId === gen.genId)) return false;
      const id = gen.messageId && !chat.messages.some((m) => m.id === gen.messageId) ? gen.messageId : uid();
      gen.messageId = id;
      chat.messages.push({
        id, role: "echo", text: gen.text, ...(gen.reasoning ? { reasoning: gen.reasoning } : {}),
        ...(gen.note ? { note: gen.note } : {}),
        via: gen.via, ...(gen.model ? { model: gen.model } : {}), genId: gen.genId, at: Date.now(), status,
        ...(error ? { errorKind: error.kind, errorMessage: error.message } : {}),
      });
    });
  } catch {}
}

/**
 * Codex（ChatGPT 订阅）：只把这一轮的新消息交给常驻的 codex app-server，
 * Codex 自己保管对话上下文；echo 的聊天记录仍然记一份，用来显示历史。
 */
async function codexChat(req, reply, cfg) {
  const body = req.body || {};
  const structured = body.streamFormat === "ndjson";
  const ids = body.ids && typeof body.ids === "object" ? body.ids : {};
  const userId = clientId(ids.user);
  const replyId = clientId(ids.echo);
  const genId = cleanGenId(body.genId);
  const detached = !!genId;
  const regenerate = body.regenerate === true;
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...incoming].reverse().find((m) => m?.role === "user");
  const text = String(lastUser?.text ?? lastUser?.content ?? "").slice(0, 64_000);
  const skillIds = Array.isArray(body.skillIds) ? body.skillIds.filter(x => typeof x === "string").slice(0,3) : [];
  const skills = (await getSkills()).filter(s => skillIds.includes(s.id) && s.enabled !== false);
  const skillText = skills.length ? "【这次要用到的技能】\n" + skills.map(s => `· ${s.name}：${s.prompt}`).join("\n") + "\n\n" : "";
  const images = Array.isArray(lastUser?.images) ? lastUser.images.slice(0, 4) : [];
  if (!text.trim() && !images.length) {
    reply.code(400);
    return { error: "bad_input", message: "要先说点什么呀" };
  }
  const bridge = codexBridge();
  if (bridge.busy) {
    reply.code(409);
    return { error: "codex_busy", message: "上一条还在回复中，等它说完再发吧", kind: "busy", actions: ["retry"] };
  }
  const settings = cfg.codex || {};
  const showThinking = settings.showThinking !== false;

  await saveUserMessage({ incoming, userId, regenerate });

  const win = await activeWindow().catch(() => null);
  const gen = generations().start({
    genId: genId || "g" + uid() + uid(), messageId: replyId || uid(), via: "codex", model: settings.model || "", windowId: win?.id,
    timeouts: cfg.timeouts, firstTokenSeconds: cfg.timeouts?.codexFirstToken, abort: () => { bridge.abortTurn().catch(() => {}); },
  });
  reply.header("X-Echo-Gen-Id", gen.genId);

  let headersSent = false;
  const live = () => !reply.raw.destroyed && !reply.raw.writableEnded;
  const sendHeaders = () => {
    if (headersSent || !live()) return;
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
  const write = (type, chunk) => {
    gen.push(type, chunk);
    if (!live()) return;
    sendHeaders();
    if (!headersSent || !live()) return;
    if (structured) reply.raw.write(JSON.stringify({ type, text: chunk }) + "\n");
    else if (type === "content") reply.raw.write(chunk);
  };

  // 旧客户端：断开 = 停止
  const onClose = () => {
    if (detached || reply.raw.writableFinished) return;
    gen.stopRequested = true;
    bridge.interrupt().catch(() => {});
  };
  reply.raw.on("close", onClose);

  let result;
  try {
    result = await bridge.runTurn({
      text: skillText + text, images, regenerate,
      cfg: { model: settings.model, effort: settings.effort, showThinking },
      handlers: {
        onContent: (t) => write("content", t),
        onThought: (t) => { if (showThinking) write("reasoning", t); else gen.touch(); },
        onActivity: () => gen.touch(),
      },
    });
  } catch (e) {
    result = { status: "failed", error: e.message, code: e.code };
  } finally {
    reply.raw.off("close", onClose);
  }
  const stopped = gen.stopRequested || (result.status === "interrupted" && !gen.timeout);
  let error = null;
  if (!stopped && gen.timeout) error = classifyReplyError({ timeout: gen.timeout, seconds: gen.timeoutSeconds, via: "codex" });
  else if (!stopped && (result.status === "failed" || (!gen.text && result.error))) {
    error = result.code === "busy" ? classifyReplyError({ message: "codex_busy" })
      : classifyReplyError({ message: result.error, via: "codex" });
    if (error.kind === "other") error.message = gentleCodexError(result.error);
  }
  const note = result.note || "";
  if (note && !error) write("note", note);

  const status = stopped ? "stopped" : error ? "error" : "done";
  await saveEchoMessage(gen, { status, error });
  gen.finish(status, error);

  if (error && !headersSent && live()) {
    reply.code(error.kind === "busy" ? 409 : gen.timeout ? 504 : 502);
    return reply.send({ error: "codex", message: error.message, kind: error.kind, actions: error.actions, genId: gen.genId });
  }
  if (error && live()) {
    if (structured) { reply.raw.write(JSON.stringify({ type: "error", text: error.message, kind: error.kind, actions: error.actions }) + "\n"); reply.raw.end(); }
    else { reply.raw.destroy(new Error(error.message)); }
    return;
  }
  if (live()) {
    sendHeaders();
    reply.raw.end();
  } else if (!headersSent) reply.hijack();
}
