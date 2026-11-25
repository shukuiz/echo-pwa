// 生成登记处：每次回复都有一个请求 ID（genId）。
// - 前端离开聊天页、切到后台、网络断一下，后端照样生成完并落盘；回来时按 genId 接上进度
// - 只有「停止」按钮（POST /api/chat/stop）才真正取消上游
// - 首字超时 / 中途卡住 / 总时长上限：到点自动结束，保留已生成的文字
import { DEFAULT_TIMEOUTS as DEFAULT_TIMEOUTS_LOCAL } from "./timeouts.js";
export { DEFAULT_TIMEOUTS, normTimeouts } from "./timeouts.js";
const KEEP_FINISHED_MS = 10 * 60_000;

/** 前端生成的请求 ID：只收短的安全字符 */
export const cleanGenId = (v) => (typeof v === "string" && /^[A-Za-z0-9_-]{6,48}$/.test(v) ? v : null);

class Generation {
  constructor({ genId, messageId, windowId, via, model, timeouts, firstTokenSeconds, abort, now = Date.now }) {
    Object.assign(this, { genId, messageId, windowId: windowId || "", via, model: model || "" });
    this.status = "streaming";
    this.text = ""; this.reasoning = ""; this.note = "";
    this.error = null; // { kind, message, actions }
    this.startedAt = now(); this.firstAt = 0; this.lastAt = this.startedAt; this.finishedAt = 0;
    this.timeout = null; // "first" | "stall" | "total"
    this.stopRequested = false;
    this.listeners = new Set();
    this.abort = abort || (() => {});
    this.now = now;
    const t = timeouts || DEFAULT_TIMEOUTS_LOCAL;
    this.limits = { first: firstTokenSeconds ?? t.firstToken, stall: t.stall, total: t.total };
    // 测试里把「一秒」缩短（ECHO_TIMEOUT_UNIT_MS），线上就是 1000
    this.unit = Number(process.env.ECHO_TIMEOUT_UNIT_MS) || 1000;
    this.timer = setInterval(() => this.check(), Math.min(1000, this.unit));
    this.timer.unref?.();
  }
  /** 看门狗：超时就记下原因并取消上游 */
  check() {
    if (this.status !== "streaming") return;
    const t = this.now(), L = this.limits;
    let reason = null, seconds = 0;
    const u = this.unit;
    if (!this.firstAt && t - this.startedAt > L.first * u) { reason = "first"; seconds = L.first; }
    else if (this.firstAt && t - this.lastAt > L.stall * u) { reason = "stall"; seconds = L.stall; }
    else if (t - this.startedAt > L.total * u) { reason = "total"; seconds = L.total; }
    if (!reason) return;
    this.timeout = reason; this.timeoutSeconds = seconds;
    try { this.abort("timeout"); } catch {}
  }
  /** 有动静（工具调用、思考）也算没卡住 */
  touch() { this.lastAt = this.now(); }
  push(type, chunk) {
    if (!chunk) return;
    const t = this.now();
    if (type === "content" || type === "reasoning") { if (!this.firstAt) this.firstAt = t; this.lastAt = t; }
    if (type === "content") this.text += chunk;
    else if (type === "reasoning") this.reasoning += chunk;
    else if (type === "reasoning_translated") this.reasoning = chunk;
    else if (type === "note") this.note = chunk;
    for (const fn of this.listeners) { try { fn(type, chunk); } catch {} }
  }
  stop() {
    if (this.status !== "streaming") return false;
    this.stopRequested = true;
    try { this.abort("stopped"); } catch {}
    return true;
  }
  finish(status, error = null) {
    if (this.status !== "streaming") return;
    this.status = status; this.error = error; this.finishedAt = this.now();
    clearInterval(this.timer);
    for (const fn of this.listeners) { try { fn("finish", status); } catch {} }
    this.listeners.clear();
  }
  snapshot() {
    return {
      genId: this.genId, messageId: this.messageId, windowId: this.windowId, via: this.via, model: this.model,
      status: this.status, text: this.text, reasoning: this.reasoning, note: this.note,
      ...(this.error ? { errorKind: this.error.kind, errorMessage: this.error.message, actions: this.error.actions } : {}),
      startedAt: this.startedAt, firstAt: this.firstAt, lastAt: this.lastAt, finishedAt: this.finishedAt,
    };
  }
}

export class Generations {
  constructor() { this.map = new Map(); }
  start(opts) {
    this.prune();
    const old = this.map.get(opts.genId);
    if (old && old.status === "streaming") throw Object.assign(new Error("这个请求已经在生成了"), { statusCode: 409 });
    const g = new Generation(opts);
    this.map.set(g.genId, g);
    return g;
  }
  get(id) { return this.map.get(id) || null; }
  running() { return [...this.map.values()].filter((g) => g.status === "streaming"); }
  /** 最近的（进行中的 + 10 分钟内结束的），给前端回来时接上 */
  recent() { this.prune(); return [...this.map.values()].map((g) => g.snapshot()); }
  prune() {
    const t = Date.now();
    for (const [id, g] of this.map) if (g.status !== "streaming" && t - g.finishedAt > KEEP_FINISHED_MS) this.map.delete(id);
  }
}

let shared;
export function generations() { shared ||= new Generations(); return shared; }
export function setGenerationsForTests(g) { shared = g; }
