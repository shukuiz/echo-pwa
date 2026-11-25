// 换窗：写窗影 → 归档旧窗口 → 开新窗口（新的 X-Serein-Window-ID）→ 接上连续性
// - Serein 网关：新窗口第一条消息前面带 /resume，Serein 按「设置 → 开窗续接」的选择把资料接进来
// - Codex：开一条新线程，先用 thread/inject_items 预装续接资料（docs/codex-continuity-packet.md）
// - 其它接口：把续接资料放进这一窗的系统提示
// 任何一步失败都不丢旧聊天：窗影写失败会停下来问她（重试 / 不写直接换），续接失败旧窗口照旧是当前窗口
import { getConfig, authHeaders } from "./config.js";
import { buildSystemPrompt } from "./prompt.js";
import { codexBridge } from "./codex.js";
import { generations } from "./generations.js";
import { readChat, withChatLock } from "./chat-store.js";
import { stripThink } from "./thinking.js";
import path from "node:path";
import { paths, readJSON, DATA_DIR } from "./storage.js";
import {
  loadIndex, saveIndex, windowFile, writeAtomic, newSereinWindowId, validWindowId,
} from "./windows-store.js";
import {
  SereinError, writeShadow, readResume, patchSereinSettings, codexItemsFromResume, resumeAsText,
} from "./serein-client.js";

const normBase = (u) => String(u || "").replace(/\/+$/, "");
export const LOCAL_SEREIN_GATEWAY = "http://127.0.0.1:18217/v1";

/** 当前聊天连接是不是 Serein 网关 */
export function isSereinGateway(cfg, env = process.env) {
  if (cfg.apiMode !== "custom") return false;
  const url = normBase(cfg.proxyUrl);
  const trusted = normBase(env.ECHO_SEREIN_API_BASE);
  const local = normBase(env.ECHO_SEREIN_GATEWAY_URL || LOCAL_SEREIN_GATEWAY);
  return url === local || (!!trusted && url === trusted);
}
export const continuityMode = (cfg) => cfg.apiMode === "codex" ? "codex" : isSereinGateway(cfg) ? "resume" : "prompt";

// ---------- 续接选择：默认每类 10 条，1–50 ----------
export const DEFAULT_SELECTION = Object.freeze({
  latest_shadow: true, recent_events: true, recent_event_limit: 10, recent_scenes: true, recent_scene_limit: 10,
  favorite_scenes: true, recent_originals: false, recent_original_limit: 10, pending_originals: false,
  selected_memories: false, selected_ids: [],
});
const BOOL = ["latest_shadow", "recent_events", "recent_scenes", "favorite_scenes", "recent_originals", "pending_originals", "selected_memories"];
const LIMIT = ["recent_event_limit", "recent_scene_limit", "recent_original_limit"];
export function normSelection(input, prev = DEFAULT_SELECTION) {
  const out = { ...DEFAULT_SELECTION, ...(prev || {}) };
  if (!input || typeof input !== "object") return out;
  for (const k of BOOL) if (input[k] !== undefined) out[k] = input[k] === true;
  for (const k of LIMIT) if (input[k] !== undefined) {
    const v = Number(input[k]);
    if (!Number.isInteger(v) || v < 1 || v > 50) throw Object.assign(new Error("每类资料要在 1–50 条之间"), { statusCode: 400 });
    out[k] = v;
  }
  if (Array.isArray(input.selected_ids)) {
    out.selected_ids = [...new Set(input.selected_ids.filter((x) => typeof x === "string" && x.trim() && x.length <= 200))].slice(0, 200);
  }
  // Serein 规定「最近原话」和「尚未整理的原话」二选一
  if (input.recent_originals === true) out.pending_originals = false;
  else if (input.pending_originals === true) out.recent_originals = false;
  return out;
}

// ---------- 窗影：让当前主模型写 ----------
const SHADOW_RULE = "准备换窗了。请你以正在和她聊天的自己，按 Serein 窗影的写法写这一窗：我眼中的你、我眼中的自己、这一窗发生的事。" +
  "写具体的新认识、变化、选择和未完事项；没有变化可以留空，不把暂时的情绪写成固定人格；最近的事可以简单带过。";
const SHADOW_FORMAT = "只输出一个 JSON 对象，不要别的文字、不要代码块：" +
  '{"title":"这一窗的标题，12 字以内","user_view":"我眼中的你（2000 字以内）","self_view":"我眼中的自己（2000 字以内）","recent_events":"这一窗发生的事（4000 字以内）"}';
export const SHADOW_PROMPT = SHADOW_RULE + "\n" + SHADOW_FORMAT;

/** 从模型回复里取出窗影 JSON（容忍代码块、<think>、前后多余的话） */
export function parseShadow(text) {
  const clean = stripThink(String(text || "")).replace(/```(?:json)?/gi, "");
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有按格式写窗影");
  let j;
  try { j = JSON.parse(clean.slice(start, end + 1)); } catch { throw new Error("模型写的窗影不是合法的 JSON"); }
  const pick = (k, max) => (typeof j[k] === "string" ? j[k].trim().slice(0, max) : "");
  const shadow = { title: pick("title", 60) || "这一窗", user_view: pick("user_view", 2000), self_view: pick("self_view", 2000), recent_events: pick("recent_events", 20000) };
  if (!shadow.user_view && !shadow.self_view && !shadow.recent_events) throw new Error("模型写的窗影是空的");
  return shadow;
}

/** 这一窗的对话（给模型写窗影用）：最近 80 条，最多约 3 万字 */
function windowTranscript(messages) {
  const list = messages.filter((m) => m.text && (m.role === "user" || m.role === "echo")).slice(-80);
  const out = [];
  let used = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    const content = m.role === "user" ? String(m.text) : stripThink(m.text);
    used += content.length;
    if (used > 30_000 && out.length) break;
    out.unshift({ role: m.role === "user" ? "user" : "assistant", content });
  }
  return out;
}

async function draftShadowViaApi(cfg, win, messages) {
  const base = normBase(cfg.proxyUrl);
  if (!cfg.apiKey || !/^https?:\/\//i.test(base)) throw new Error("当前聊天连接还没设置好，写不了窗影");
  const serein = isSereinGateway(cfg);
  // 写窗影的请求放在 <attachment> 里：Serein 把它当作客户端附带的上下文，不会当成她说的话归档进原话
  const ask = serein ? `<attachment type="echo-window-shadow-request">\n${SHADOW_PROMPT}\n</attachment>` : SHADOW_PROMPT;
  const body = {
    model: cfg.model, stream: false,
    messages: [{ role: "system", content: await buildSystemPrompt() }, ...windowTranscript(messages), { role: "user", content: ask }],
    ...(serein ? { serein: { memory: false } } : {}),
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST", signal: AbortSignal.timeout(180_000),
    headers: { "Content-Type": "application/json", ...authHeaders(cfg), ...(serein ? { "X-Serein-Window-ID": win.sereinWindowId } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`模型接口返回 ${res.status}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("模型接口返回的不是 JSON"); }
  const content = data?.choices?.[0]?.message?.content;
  return parseShadow(Array.isArray(content) ? content.map((p) => p?.text || "").join("") : content);
}

async function draftShadowViaCodex(cfg) {
  const bridge = codexBridge();
  let out = "";
  const r = await bridge.runTurn({
    text: SHADOW_PROMPT, cfg: { model: cfg.codex?.model, effort: "low", showThinking: false },
    handlers: { onContent: (t) => { out += t; } },
  });
  if (r.status === "failed") throw new Error(r.error || "Codex 没写出来");
  return parseShadow(out);
}

/** 让当前主模型写这一窗的窗影（还没存） */
export async function draftShadow(cfg, win, messages) {
  if (!messages.some((m) => m.text)) throw new Error("这一窗还没有聊过，不用写窗影");
  return cfg.apiMode === "codex" ? draftShadowViaCodex(cfg) : draftShadowViaApi(cfg, win, messages);
}

let switching = false;
export const isSwitching = () => switching;

const stageError = (stage, e) => Object.assign(new Error(e.message), { stage, statusCode: e.status === 413 ? 413 : e.statusCode || 502 });

/**
 * 换窗。opts: { selection, skipShadow, skipContinuity }
 * 返回 { window, previous, shadow: { status, title? }, continuity: { mode, items, status } }
 */
export async function switchWindow(opts = {}, deps = {}) {
  if (switching) throw Object.assign(new Error("正在换窗，稍等一下"), { stage: "busy", statusCode: 409 });
  if (generations().running().length) throw Object.assign(new Error("echo 还在回复，等这条说完再换窗"), { stage: "busy", statusCode: 409 });
  switching = true;
  try {
    const cfg = deps.cfg || await getConfig();
    const idx = await loadIndex();
    const prev = idx.windows.find((w) => w.id === idx.activeId);
    const selection = normSelection(opts.selection, idx.selection);
    const mode = continuityMode(cfg);
    const chat = await readChat();
    const codexState = path.join(paths.settings(DATA_DIR), "codex-thread.json");
    const prevCodexThread = mode === "codex" ? (await readJSON(codexState, {})).threadId || "" : "";

    // (a) 窗影：当前主模型写，存进 Serein（和 MCP window_shadow_write 同一个功能）
    let shadow = { status: "skipped" };
    if (!opts.skipShadow && chat.messages.some((m) => m.text)) {
      let draft;
      try { draft = await (deps.draftShadow || draftShadow)(cfg, prev, chat.messages); } catch (e) { throw stageError("shadow", e); }
      try {
        const saved = await (deps.writeShadow || writeShadow)({ windowId: prev.sereinWindowId, ...draft });
        shadow = { status: "saved", title: draft.title, id: saved?.id, revision: saved?.revision, sections: draft };
      } catch (e) { throw stageError("shadow", e); }
    } else if (!opts.skipShadow) shadow = { status: "empty" };

    // (b) 新窗口
    const n = Math.max(0, ...idx.windows.map((w) => w.n || 0)) + 1;
    const next = { id: `w${n}`, n, title: `第 ${n} 窗`, sereinWindowId: newSereinWindowId(n), createdAt: Date.now(), archivedAt: 0, messageCount: 0, via: mode, previousId: prev.id };

    // (c) 连续性：Codex 先建好新线程并预装资料，成功了才真正换窗
    let continuity = { mode, status: opts.skipContinuity ? "skipped" : "pending", items: 0 };
    if (!opts.skipContinuity) {
      try {
        if (mode === "resume") {
          // Serein 网关 /resume 读的是「设置 → 开窗续接」里保存的选择：把这次的选择存进去
          await (deps.patchSereinSettings || patchSereinSettings)({ features: { resume: true }, resume: { ...selection, command_enabled: true } });
          next.resume = { pending: true, anchorId: "", selection };
          continuity = { mode, status: "pending", items: 0 };
        } else {
          const packet = await (deps.readResume || readResume)({ windowId: next.sereinWindowId, sourceSessionId: prev.sereinWindowId, selection });
          if (mode === "codex") {
            const items = codexItemsFromResume(packet);
            const r = await (deps.codexStart || ((c, it) => codexBridge().startContinuityThread(c, it)))(cfg.codex || {}, items);
            next.codexThreadId = r.threadId;
            continuity = { mode, status: "injected", items: packet.items.length, threadId: r.threadId };
          } else {
            next.context = resumeAsText(packet);
            continuity = { mode, status: "prompt", items: packet.items.length };
          }
        }
      } catch (e) { throw stageError("continuity", e); }
    } else if (mode === "codex") {
      await (deps.codexReset || (() => codexBridge().resetThread()))();
    }

    // (d) 归档 + 切换：和聊天写入排同一条队，归档那一刻不会有新消息插进来
    await withChatLock(async () => {
      const current = await readJSON(paths.chat(DATA_DIR), { messages: [] });
      const msgs = current.windowId && current.windowId !== prev.id ? [] : (current.messages || []);
      await writeAtomic(windowFile(prev.id), { windowId: prev.id, messages: msgs, archivedAt: Date.now() });
      const check = await readJSON(windowFile(prev.id), null);
      if (!check || (check.messages || []).length !== msgs.length) throw Object.assign(new Error("归档没写成功，旧聊天还在原处"), { stage: "archive", statusCode: 500 });
      Object.assign(prev, { archivedAt: Date.now(), messageCount: msgs.length, ...(shadow.status === "saved" ? { shadow: { title: shadow.title, id: shadow.id, revision: shadow.revision, sections: shadow.sections, savedAt: Date.now() } } : {}) });
      if (prevCodexThread) prev.codexThreadId = prevCodexThread; // 旧窗口 = 旧的那条 Codex 线程（留在 Codex 记录里，不删）
      idx.windows.push(next);
      idx.activeId = next.id;
      idx.selection = selection;
      await saveIndex(idx);
      await writeAtomic(paths.chat(DATA_DIR), { windowId: next.id, messages: [] });
    });
    return { window: publicWindow(next), previous: publicWindow(prev), shadow: { status: shadow.status, title: shadow.title }, continuity };
  } finally {
    switching = false;
  }
}

export function publicWindow(w) {
  if (!w) return null;
  const { context, ...rest } = w;
  return { ...rest, hasContext: !!context };
}

export async function listWindows() {
  const idx = await loadIndex();
  return { activeId: idx.activeId, selection: normSelection(idx.selection), windows: idx.windows.map(publicWindow).reverse() };
}

export async function readWindow(id) {
  if (!validWindowId(id)) throw Object.assign(new Error("没有这个窗口"), { statusCode: 404 });
  const idx = await loadIndex();
  const w = idx.windows.find((x) => x.id === id);
  if (!w) throw Object.assign(new Error("没有这个窗口"), { statusCode: 404 });
  const messages = id === idx.activeId ? (await readChat()).messages : (await readJSON(windowFile(id), { messages: [] })).messages || [];
  return { window: publicWindow(w), active: id === idx.activeId, readOnly: id !== idx.activeId, messages };
}

export { SereinError };
