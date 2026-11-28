// Codex（ChatGPT 订阅）连接：后端常驻一个 `codex app-server`（JSON-RPC over stdio，一行一条 JSON），
// echo 只用其中一条长期对话（thread），每条消息只把新的那句话发过去，Codex 自己保管上下文。
// 这是 echo 自己的实现，按 Codex app-server 公开协议（`codex app-server generate-ts`）编写。
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { paths, readJSON, readText, writeJSON, DATA_DIR } from "./storage.js";
import { readChat } from "./chat-store.js";
import { getSkills } from "./skills.js";
import { ECHO_ACTIONS_HINT } from "./echo-actions-hint.js";

export const CODEX_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"];
export const DEFAULT_CODEX = Object.freeze({ model: "", effort: "medium", showThinking: true });
const CALL_TIMEOUT = 30_000;
const TURN_IDLE_TIMEOUT = 5 * 60_000;

/** 设置里的 codex 字段：只收认识的值 */
export function normCodex(input, prev = DEFAULT_CODEX) {
  const next = { ...DEFAULT_CODEX, ...(prev || {}) };
  if (!input || typeof input !== "object") return next;
  if (typeof input.model === "string") {
    const m = input.model.trim();
    if (m.length > 120 || (m && !/^[\w.\-:/]+$/.test(m))) throw new Error("Codex 模型名不太对");
    next.model = m;
  }
  if (input.effort !== undefined) {
    if (!CODEX_EFFORTS.includes(input.effort)) throw new Error("不认识这个思考强度");
    next.effort = input.effort;
  }
  if (input.showThinking !== undefined) next.showThinking = !!input.showThinking;
  return next;
}

const statePath = (dir) => path.join(paths.settings(dir), "codex-thread.json");
const hashText = (s) => createHash("sha256").update(String(s || "")).digest("hex").slice(0, 16);
const meaningful = (s) => String(s || "").split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).join("\n").trim();

/** 给 Codex 的开发者说明：说明书本身由 Codex 从 cwd 的 AGENTS.md 读取，这里只交代「这是聊天」和记忆工具 */
export async function codexDeveloperInstructions(dir = DATA_DIR) {
  const parts = [
    "你现在在 echo 聊天 App 里和用户聊天。你的身份、性格和说话方式以工作目录里的 AGENTS.md（echo 的说明书）为准。",
    "这是日常聊天，不是编程任务：不要读写文件、不要运行命令，除非用户明确要求。回复像聊天消息一样自然，不用 Markdown 标题和长列表。",
    "如果有 serein 记忆工具：聊到过去的事、她的喜好或约定时，可以先用 recall_memory 查一查；遇到值得长期记住的事，用 write_scene 记下来。不要把工具的原始结果念给她听。",
  ];
  const aboutYou = meaningful(await readText(paths.aboutYou(dir)));
  const aboutUs = meaningful(await readText(paths.aboutUs(dir)));
  const skills = (await getSkills(dir)).filter((skill) => skill.enabled !== false).slice(0, 8);
  parts.push("她没选技能时，明显合适的话你也可以按某个技能的思路做，但不用说出来。\n【可用技能】\n" + skills.map((skill) => `${skill.name}：${skill.desc}`).join("\n"));
  parts.push(ECHO_ACTIONS_HINT);
  parts.push("她有一个自己的相册（你看不到里面），也有一个你的相册。她刚截图或存图的时候你只知道「她刚截了图」，看不到图本身。");
  if (aboutYou) parts.push("【关于用户】\n" + aboutYou);
  if (aboutUs) parts.push("【关于你们】\n" + aboutUs);
  return parts.join("\n\n");
}

/** 把 Codex 的英文报错翻成温柔的中文 */
export function gentleCodexError(message = "") {
  const m = String(message);
  if (/not logged in|login|unauthori[sz]ed|401|auth/i.test(m)) return "Codex 还没登录 ChatGPT，或登录过期了，去 设置 → 聊天连接 → Codex 重新登录一下吧";
  if (/usage limit|rate limit|429|quota/i.test(m)) return "ChatGPT 订阅这阵子的额度用完啦，等额度恢复再来，或先切回别的连接 (；´д｀)";
  if (/ENOENT|spawn/i.test(m)) return "服务器上找不到 codex 程序，需要先安装 codex-cli";
  if (/timed? ?out/i.test(m)) return "Codex 太久没回应了，再试一次吧";
  return "Codex 出了点小状况" + (m ? "：" + m.slice(0, 160) : "");
}

export class CodexBridge extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.dataDir = opts.dataDir || DATA_DIR;
    this.command = opts.command || process.env.ECHO_CODEX_BIN || "codex";
    this.args = opts.args || ["app-server", ...(process.env.ECHO_CODEX_ARGS ? process.env.ECHO_CODEX_ARGS.split(" ").filter(Boolean) : [])];
    this.env = opts.env || process.env;
    this.version = opts.version || "0.10.0";
    this.proc = null;
    this.starting = null;
    this.nextId = 1;
    this.pending = new Map();
    this.turn = null; // 进行中的一轮 { threadId, turnId, handlers }
    this.lastError = "";
    this.account = undefined;
    this.mcp = {};
    this.login = null;
    this.threadId = "";
    this.threadLoaded = false;
    this.state = null;
    this.writing = null;
  }

  childEnv() {
    const env = { ...this.env };
    env.CODEX_HOME ||= path.join(os.homedir(), ".codex");
    const tokenFile = this.env.ECHO_CODEX_SEREIN_TOKEN_FILE;
    if (tokenFile && !env.SEREIN_MCP_TOKEN) {
      try { env.SEREIN_MCP_TOKEN = readFileSync(tokenFile, "utf8").trim(); } catch {}
    }
    // 后端自己的密钥不交给 Codex
    for (const k of Object.keys(env)) if (/^ECHO_(AUTH|CF|PROJECT)_/.test(k)) delete env[k];
    return env;
  }

  get alive() { return !!this.proc && this.proc.exitCode === null && !this.proc.killed; }

  /** 确保 app-server 在跑并完成握手 */
  async ensure() {
    if (this.alive && !this.starting) return;
    if (this.starting) return this.starting;
    this.starting = this.#start().finally(() => { this.starting = null; });
    return this.starting;
  }

  async #start() {
    const proc = spawn(this.command, this.args, { cwd: this.dataDir, env: this.childEnv(), stdio: ["pipe", "pipe", "pipe"] });
    this.proc = proc;
    this.threadLoaded = false;
    const spawned = new Promise((resolve, reject) => {
      proc.once("spawn", resolve);
      proc.once("error", reject);
    });
    proc.on("error", (e) => { this.lastError = gentleCodexError(e.message); });
    proc.stderr.on("data", () => {}); // 日志里可能有路径信息，不转发
    proc.on("exit", () => {
      if (this.proc === proc) this.proc = null;
      for (const [, p] of this.pending) p.reject(new Error("codex app-server 退出了"));
      this.pending.clear();
      if (this.turn) this.#finishTurn({ status: "failed", error: "Codex 进程意外退出了" });
    });
    readline.createInterface({ input: proc.stdout }).on("line", (line) => this.#onLine(line));
    await spawned;
    await this.call("initialize", { clientInfo: { name: "echo", title: "echo", version: this.version }, capabilities: null });
    this.#send({ method: "initialized" });
    this.lastError = "";
  }

  stop() {
    if (this.proc) this.proc.kill();
    this.proc = null;
  }

  #send(msg) {
    if (!this.proc?.stdin.writable) throw new Error("codex app-server 没在运行");
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  call(method, params = {}, timeout = CALL_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      try { this.#send({ id, method, params }); } catch (e) { this.pending.delete(id); clearTimeout(timer); reject(e); }
    });
  }

  #onLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id !== undefined && msg.method === undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || "Codex 请求失败"));
      else p.resolve(msg.result);
      return;
    }
    if (msg.id !== undefined && msg.method) return this.#onServerRequest(msg);
    if (msg.method) this.#onNotification(msg.method, msg.params || {});
  }

  /** Codex 反过来问我们的事：只读聊天，一律不批准执行命令 / 改文件 */
  #onServerRequest({ id, method, params }) {
    let result;
    if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") result = { decision: "decline" };
    else if (method === "execCommandApproval" || method === "applyPatchApproval") result = { decision: "abort" };
    else if (method === "mcpServer/elicitation/request") result = { action: params?.serverName === "serein" ? "accept" : "decline", content: null, _meta: null };
    if (result) this.#send({ id, result });
    else this.#send({ id, error: { code: -32601, message: "echo 不支持这个请求" } });
  }

  #onNotification(method, p) {
    if (method === "mcpServer/startupStatus/updated" && p.name) {
      this.mcp[p.name] = { status: p.status, error: p.error ? String(p.error).slice(0, 200) : "" };
    } else if (method === "account/updated" || method === "account/login/completed") {
      this.account = undefined; // 下次读状态时重新取
      if (method === "account/login/completed") this.login = p.success === false ? { ...this.login, error: p.error || "登录没有完成" } : null;
    }
    const t = this.turn;
    if (!t || (p.threadId && p.threadId !== t.threadId)) return;
    // turn/start 的回复可能比第一批通知晚到：同一时间只有一轮，先到的那个 turnId 就是这一轮
    const turnId = p.turnId || (method.startsWith("turn/") ? p.turn?.id : "");
    if (turnId && !t.turnId) t.turnId = turnId;
    if (turnId && turnId !== t.turnId) return;
    t.touch();
    t.onActivity?.();
    switch (method) {
      case "item/started": {
        const it = p.item || {};
        if (it.type === "agentMessage") t.phase.set(it.id, it.phase || null);
        else if (it.type === "mcpToolCall") t.onTool?.(`${it.server === "serein" ? "翻了翻记忆" : "用了工具"} · ${it.tool}`);
        else if (it.type === "commandExecution") t.onTool?.("想运行命令（只读模式，已跳过）");
        break;
      }
      case "item/agentMessage/delta": {
        const phase = t.phase.get(p.itemId);
        if (phase === "commentary") t.emit("thought", p.delta, p.itemId);
        else t.emit("content", p.delta, p.itemId);
        break;
      }
      case "item/reasoning/summaryTextDelta":
        t.emit("thought", p.delta, `${p.itemId}:${p.summaryIndex ?? 0}`);
        break;
      case "error":
        if (!p.willRetry) t.error = p.error?.message || "Codex 出错了";
        break;
      case "turn/completed": {
        const turn = p.turn || {};
        this.#finishTurn({ status: turn.status || "completed", error: turn.error?.message || t.error || "" });
        break;
      }
      default:
    }
  }

  #finishTurn(result) {
    const t = this.turn;
    if (!t) return;
    this.turn = null;
    t.done(result);
  }

  /** 对话状态以内存为准，只在第一次用时读文件；写文件排队，避免旧的写入盖掉新的 */
  async loadState() {
    if (!this.state) {
      const s = await readJSON(statePath(this.dataDir), {});
      this.state ||= s && typeof s === "object" ? s : {};
      this.threadId = typeof this.state.threadId === "string" ? this.state.threadId : "";
    }
    return this.state;
  }

  async saveState(patch) {
    await this.loadState();
    this.state = { ...this.state, ...patch };
    const snapshot = { ...this.state };
    this.writing = (this.writing || Promise.resolve()).then(() => writeJSON(statePath(this.dataDir), snapshot), () => writeJSON(statePath(this.dataDir), snapshot));
    await this.writing;
    return snapshot;
  }

  async agentsHash() {
    return hashText(await readText(paths.agents(this.dataDir)));
  }

  threadParams(cfg, developerInstructions) {
    return {
      cwd: this.dataDir,
      sandbox: "read-only",
      approvalPolicy: "never",
      ...(cfg.model ? { model: cfg.model } : {}),
      developerInstructions,
      serviceName: "echo",
    };
  }

  /** 拿到可用的 thread：有存档就接上，没有（或接不上）就开新的 */
  async ensureThread(cfg) {
    await this.ensure();
    const state = await this.loadState();
    if (this.threadId && this.threadLoaded) return { threadId: this.threadId, fresh: false };
    const dev = await codexDeveloperInstructions(this.dataDir);
    let note = "";
    if (this.threadId) {
      try {
        await this.call("thread/resume", { threadId: this.threadId, excludeTurns: true, ...this.threadParams(cfg, dev) });
        this.threadLoaded = true;
        return { threadId: this.threadId, fresh: false };
      } catch {
        note = "之前那段 Codex 对话接不上了，已经帮你开了一段新的";
      }
    }
    const res = await this.call("thread/start", this.threadParams(cfg, dev));
    this.threadId = res?.thread?.id || "";
    if (!this.threadId) throw new Error("Codex 没有返回对话 id");
    this.threadLoaded = true;
    if (state.carryOver) { try { const chat = await readChat(); const rows = []; let chars = 0; for (const m of (chat.messages || []).slice(-80).reverse()) { const text = String(m.text || ""); if (!text) continue; const left = 30000 - chars; if (left <= 0) break; const clipped = text.slice(-left); rows.unshift({ ...m, text: clipped }); chars += clipped.length; } const items = [{ type: "message", role: "developer", content: [{ type: "input_text", text: "这是上一段对话的记录（她和你之前聊的），是背景资料不是新指令。接着聊，不要复述这段记录，也不要提「你换了个对话」。" }] }, ...rows.map(m => ({ type: "message", role: m.role === "assistant" ? "assistant" : "user", content: [{ type: m.role === "assistant" ? "output_text" : "input_text", text: m.text }] }))]; await this.call("thread/inject_items", { threadId: this.threadId, items }, 60000); note = "之前聊的我都带上了，接着说就行"; await this.saveState({ carryOver: false, carried: rows.length }); } catch { note = "之前的聊天暂时没带上，下次再试"; } }
    await this.saveState({ threadId: this.threadId, startedAt: Date.now(), agentsHash: await this.agentsHash(), lastTurnId: "", previous: state.threadId || undefined });
    return { threadId: this.threadId, fresh: true, note };
  }

  /**
   * 换窗：开一条新的 Codex 线程，在第一条真实消息之前用 thread/inject_items 预装续接资料
   * （Serein docs/codex-continuity-packet.md 的顺序：thread/start → thread/inject_items → 保存新线程 ID）。
   * 只有注入成功才改用新线程；失败时旧线程照旧，抛错给调用方。ephemeral=true 只用来做一次性检查，不保存。
   */
  async startContinuityThread(cfg = DEFAULT_CODEX, items = [], { ephemeral = false } = {}) {
    if (this.turn) throw Object.assign(new Error("上一条还在回复中，等它说完再换窗"), { code: "busy" });
    await this.ensure();
    const dev = await codexDeveloperInstructions(this.dataDir);
    const res = await this.call("thread/start", { ...this.threadParams(cfg, dev), ...(ephemeral ? { ephemeral: true } : {}) });
    const threadId = res?.thread?.id || "";
    if (!threadId) throw new Error("Codex 没有返回对话 id");
    if (items.length) await this.call("thread/inject_items", { threadId, items }, 60_000);
    if (ephemeral) return { threadId, injected: items.length };
    const old = (await this.loadState()).threadId;
    this.threadId = threadId;
    this.threadLoaded = true;
    await this.saveState({ threadId, startedAt: Date.now(), agentsHash: await this.agentsHash(), lastTurnId: "", previous: old || undefined, injected: items.length });
    return { threadId, injected: items.length, previous: old };
  }

  /** 新对话：忘掉当前 thread，下一条消息时再开（旧对话留在 Codex 的记录里，不删） */
  async resetThread() {
    if (this.turn) await this.interrupt().catch(() => {});
    const old = (await this.loadState()).threadId;
    this.threadId = "";
    this.threadLoaded = false;
    await this.saveState({ threadId: "", lastTurnId: "", previous: old || undefined, resetAt: Date.now(), carryOver: true, carryOverAt: Date.now() });
    return { ok: true };
  }

  get busy() { return !!this.turn; }

  /**
   * 跑一轮。handlers: { onContent(text), onThought(text), onTool(label) }；返回 { status, error, note }
   * regenerate=true 时先把上一轮从 Codex 的记录里撤掉，再重新问。
   */
  async runTurn({ text, images = [], cfg = DEFAULT_CODEX, regenerate = false, handlers = {} }) {
    if (this.turn) throw Object.assign(new Error("上一条还在回复中，等它说完再发吧"), { code: "busy" });
    const { threadId, note } = await this.ensureThread(cfg);
    const state = await this.loadState();
    if (regenerate && state.lastTurnId) {
      try { await this.call("thread/revert", { threadId, beforeTurnId: state.lastTurnId }); } catch {}
    }
    const input = [{ type: "text", text: String(text || "") || "（图片）", text_elements: [] }];
    for (const url of images) {
      if (typeof url === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) input.push({ type: "image", url });
    }

    let lastKey = { content: "", thought: "" };
    let idle;
    const finished = new Promise((resolve) => {
      const turn = {
        threadId, turnId: "", phase: new Map(), error: "",
        onActivity: handlers.onActivity,
        onTool: (label) => { handlers.onThought?.((lastKey.thought ? "\n\n" : "") + `（${label}）`); lastKey.thought = "tool"; },
        emit: (kind, delta, key) => {
          if (!delta) return;
          // 换了一段（新的消息或新的思考摘要）就空一行
          const sep = lastKey[kind] && lastKey[kind] !== key ? "\n\n" : "";
          lastKey[kind] = key;
          if (kind === "content") handlers.onContent?.(sep + delta);
          else handlers.onThought?.(sep + delta);
        },
        touch: () => {
          clearTimeout(idle);
          idle = setTimeout(() => {
            this.interrupt().catch(() => {});
            this.#finishTurn({ status: "failed", error: "timed out" });
          }, TURN_IDLE_TIMEOUT);
        },
        done: (r) => { clearTimeout(idle); resolve(r); },
      };
      this.turn = turn;
      turn.touch();
    });
    try {
      const res = await this.call("turn/start", {
        threadId, input,
        ...(cfg.model ? { model: cfg.model } : {}),
        effort: cfg.effort || "medium",
        summary: cfg.showThinking === false ? "none" : "auto",
      });
      const turnId = res?.turn?.id || "";
      if (this.turn && !this.turn.turnId) this.turn.turnId = turnId;
      if (turnId && this.threadId === threadId) await this.saveState({ lastTurnId: turnId });
    } catch (e) {
      this.#finishTurn({ status: "failed", error: e.message });
    }
    const result = await finished;
    return { ...result, note };
  }

  /** 超时 / 停止：先请 Codex 停下；几秒内没停（还没拿到 turnId 之类）就直接结束这一轮 */
  async abortTurn(wait = 3000) {
    const t = this.turn;
    if (!t) return;
    await this.interrupt().catch(() => {});
    setTimeout(() => { if (this.turn === t) this.#finishTurn({ status: "interrupted", error: "" }); }, wait).unref?.();
  }

  async interrupt() {
    const t = this.turn;
    if (!t?.turnId) return false;
    await this.call("turn/interrupt", { threadId: t.threadId, turnId: t.turnId }, 10_000);
    return true;
  }

  async readAccount() {
    await this.ensure();
    const res = await this.call("account/read", {});
    const a = res?.account;
    this.account = a ? { type: a.type, email: a.email || "", planType: a.planType || "" } : null;
    return this.account;
  }

  async status() {
    const state = await this.loadState();
    const out = {
      installed: true, alive: false, loggedIn: false, account: null, busy: this.busy,
      hasThread: !!state.threadId, threadStartedAt: state.startedAt || 0,
      agentsChanged: !!state.threadId && !!state.agentsHash && state.agentsHash !== await this.agentsHash(),
      mcp: this.mcp, login: this.login, error: "",
    };
    try {
      const account = await this.readAccount();
      out.alive = this.alive;
      out.loggedIn = !!account;
      out.account = account;
    } catch (e) {
      out.alive = this.alive;
      out.installed = !/ENOENT/.test(e.message);
      out.error = gentleCodexError(e.message);
    }
    return out;
  }

  async models() {
    await this.ensure();
    const res = await this.call("model/list", {});
    return (res?.data || []).filter((m) => !m.hidden).map((m) => ({
      id: m.id || m.model, name: m.displayName || m.id, description: m.description || "",
      efforts: (m.supportedReasoningEfforts || []).map((e) => e.reasoningEffort).filter((e) => CODEX_EFFORTS.includes(e)),
      defaultEffort: m.defaultReasoningEffort || "", isDefault: !!m.isDefault,
      images: (m.inputModalities || []).includes("image"),
    }));
  }

  /** App 里直接登录：设备码方式，返回网址和一次性码 */
  async startLogin() {
    await this.ensure();
    const res = await this.call("account/login/start", { type: "chatgptDeviceCode" });
    this.login = { loginId: res?.loginId || "", url: res?.verificationUrl || "", code: res?.userCode || "", startedAt: Date.now() };
    return this.login;
  }

  async cancelLogin() {
    if (this.login?.loginId) await this.call("account/login/cancel", { loginId: this.login.loginId }).catch(() => {});
    this.login = null;
    return { ok: true };
  }
}

let shared;
/** 全后端共用一个 app-server */
export function codexBridge() {
  shared ||= new CodexBridge();
  return shared;
}
export function setCodexBridgeForTests(bridge) { shared = bridge; }
export const codexAvailable = (bin = process.env.ECHO_CODEX_BIN || "codex") =>
  bin.includes("/") ? existsSync(bin) : (process.env.PATH || "").split(":").some((d) => existsSync(path.join(d, bin)));
