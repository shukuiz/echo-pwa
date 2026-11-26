"use client";

// 回复不被打断：生成的状态放在页面外面（模块级），离开聊天页、切后台都不会把它弄丢。
// - 每次生成有自己的请求 ID（genId）；只有带同一个 ID 的进度才能改那条消息，旧请求晚到也不会盖掉重试后的回复
// - 后端不因断开连接而取消；流断了就改成按 genId 轮询，回到聊天页时从 /api/chat/active 接上
// - 「停止」走 POST /api/chat/stop，真正让后端停下
import { useSyncExternalStore } from "react";
import { api, ApiError, type GenSnapshot } from "./api";
import { uid, type Msg } from "./store";

type SetMessages = (fn: (ms: Msg[]) => Msg[]) => void;
export type LiveGen = { genId: string; echoId: string; model: string; polling: boolean; startedAt: number };

let live: LiveGen | null = null;
let ac: AbortController | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let setMsgs: SetMessages | null = null;
let streamLen = 0; // 流式收到的正文长度：切回前台时和后端比一比，看流是不是早就断了
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const setLive = (v: LiveGen | null) => { live = v; emit(); };

export function useLiveGen() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => live, () => null);
}
export const liveGen = () => live;
export const newGenId = () => "g" + uid() + uid();

/** 只改「这条消息 + 这次生成」 */
function patchIf(echoId: string, genId: string, fn: (m: Msg) => Partial<Msg>) {
  setMsgs?.((ms) => ms.map((m) => (m.id === echoId && m.genId === genId ? { ...m, ...fn(m) } : m)));
}

function applySnapshot(echoId: string, s: GenSnapshot) {
  patchIf(echoId, s.genId, () => ({
    text: s.text, reasoning: s.reasoning || undefined, note: s.note || undefined, model: s.model || undefined,
    status: s.status,
    ...(s.status === "error" ? { errorMessage: s.errorMessage, errorKind: s.errorKind, actions: s.actions } : { errorMessage: undefined, errorKind: undefined, actions: undefined }),
  }));
}

/** 按 genId 轮询后端，直到这次生成结束 */
function poll(echoId: string, genId: string, misses = 0) {
  if (pollTimer) clearTimeout(pollTimer);
  if (live?.genId !== genId) return;
  if (!live.polling) setLive({ ...live, polling: true });
  pollTimer = setTimeout(async () => {
    if (live?.genId !== genId) return;
    try {
      const s = await api.chatGeneration(genId);
      applySnapshot(echoId, s);
      if (s.status === "streaming") return poll(echoId, genId);
      setLive(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // 后端已经不记得这次生成了（比如后端重启）：别让它一直转圈
        patchIf(echoId, genId, (m) => ({ status: m.text ? "stopped" : "error", errorKind: "network", errorMessage: m.text ? undefined : "这条回复没能接上，可能后端重启了，重试一下吧", actions: ["retry"] }));
        return setLive(null);
      }
      // 网还没回来：慢一点再试（最多约 10 分钟）
      if (misses > 200) { patchIf(echoId, genId, () => ({ status: "error", errorKind: "network", errorMessage: "网络一直没回来，已经写出的字都留着；稍后重试", actions: ["retry"] })); return setLive(null); }
      poll(echoId, genId, misses + 1);
    }
  }, misses ? Math.min(5000, 1500 + misses * 300) : 1200);
}

export async function startGeneration(opts: {
  set: SetMessages; history: Msg[]; echoId?: string; regenerate?: boolean; model?: string;
}) {
  setMsgs = opts.set;
  if (live) return;
  const genId = newGenId();
  const echoId = opts.echoId ?? uid();
  const model = opts.model || "";
  if (opts.echoId) {
    opts.set((ms) => ms.map((m) => m.id === echoId ? { ...m, text: "", reasoning: undefined, note: undefined, status: "streaming", errorMessage: undefined, errorKind: undefined, actions: undefined, genId, model, at: Date.now() } : m));
  } else {
    opts.set((ms) => [...ms, { id: echoId, role: "echo", text: "", status: "streaming", genId, model, at: Date.now() }]);
  }
  setLive({ genId, echoId, model, polling: false, startedAt: Date.now() });
  const controller = new AbortController();
  ac = controller;
  streamLen = 0;
  const input = opts.history
    .filter((m) => m.text || (m.images && m.images.length))
    .slice(-20)
    .map((m) => ({ role: m.role, text: m.text, ...(m.images && m.images.length ? { images: m.images } : {}) }));
  const userId = [...opts.history].reverse().find((m) => m.role === "user")?.id;
  try {
    await api.chatStream(input, {
      model: opts.model, signal: controller.signal, genId, ids: { user: userId, echo: echoId }, regenerate: opts.regenerate,
      onReasoning: (t) => patchIf(echoId, genId, (m) => ({ reasoning: (m.reasoning || "") + t })),
      onReasoningTranslated: (t) => patchIf(echoId, genId, () => ({ reasoning: t })),
      onNote: (t) => patchIf(echoId, genId, () => ({ note: t })),
      onDelta: (d) => { streamLen += d.length; patchIf(echoId, genId, (m) => ({ text: m.text + d })); },
    });
    const cur = liveGen();
    if (cur?.genId !== genId || cur.polling) return; // 已经改成轮询接手了
    patchIf(echoId, genId, (m) => ({ status: m.status === "stopped" ? "stopped" : "done" }));
    setLive(null);
  } catch (e) {
    const cur = liveGen();
    if (cur?.genId !== genId || cur.polling) return;
    const err = e as ApiError;
    if (err?.name === "AbortError") { patchIf(echoId, genId, () => ({ status: "stopped" })); return setLive(null); }
    // 连接断了：后端多半还在写，改成按 genId 接上
    if (err instanceof ApiError && err.status === 0) return poll(echoId, genId);
    patchIf(echoId, genId, () => ({ status: "error", errorMessage: err.message, errorKind: err.kind, actions: err.actions }));
    setLive(null);
  } finally {
    if (ac === controller) ac = null;
  }
}

/** 停止：先请后端停（会保留已写的字），连不上后端时才直接断开 */
export async function stopGeneration() {
  const g = live;
  if (!g) return;
  patchIf(g.echoId, g.genId, () => ({ status: "stopped" }));
  setLive(null);
  if (pollTimer) clearTimeout(pollTimer);
  try { await api.chatStop(g.genId); } catch { ac?.abort(); }
}

/**
 * 回到聊天页 / 从后台切回来：问后端有没有进行中的回复，有就接上；刚结束的把最终结果补上
 */
export async function resumeGenerations(set: SetMessages) {
  setMsgs = set;
  let list: GenSnapshot[];
  try { list = (await api.chatActive()).generations; } catch { return; }
  for (const s of list) {
    let known = false;
    set((ms) => {
      known = ms.some((m) => m.id === s.messageId || m.genId === s.genId);
      if (!known && s.status === "streaming") {
        return [...ms, { id: s.messageId, role: "echo", text: s.text, reasoning: s.reasoning || undefined, status: "streaming", genId: s.genId, model: s.model, at: s.startedAt }];
      }
      // 本机这条还在转圈，但后端已经写完：补上结果
      return ms.map((m) => (m.genId === s.genId && m.status === "streaming" && s.status !== "streaming") || (m.genId === s.genId && s.status === "streaming")
        ? { ...m, text: s.text, reasoning: s.reasoning || m.reasoning, note: s.note || m.note, status: s.status, errorMessage: s.errorMessage, errorKind: s.errorKind, actions: s.actions }
        : m);
    });
    if (s.status === "streaming" && (!live || live.genId === s.genId) && !(live && !live.polling && ac)) {
      const echoId = s.messageId;
      setLive({ genId: s.genId, echoId, model: s.model, polling: true, startedAt: s.startedAt });
      poll(echoId, s.genId);
    }
  }
}

/** 页面切回前台：如果流还开着但已经很久没动静，直接按 genId 拉一次最新进度 */
export async function refreshLive() {
  const g = live;
  if (!g) return;
  try {
    const s = await api.chatGeneration(g.genId);
    if (s.status !== "streaming") { applySnapshot(g.echoId, s); setLive(null); ac?.abort(); return; }
    if (!g.polling && s.text.length > streamLen) {
      applySnapshot(g.echoId, s); setLive({ ...g, polling: true }); ac?.abort(); poll(g.echoId, g.genId); }
  } catch {}
}
