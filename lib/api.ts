import type { Settings } from "./store";

// 后端 API 封装：聊天流式、记忆、文件、设置、提醒
// 后端地址可用 NEXT_PUBLIC_ECHO_API 覆盖，默认本机 8787（开发/同机部署）
export const ECHO_AUTH_ENABLED = process.env.NEXT_PUBLIC_ECHO_AUTH === "1";
export const ECHO_AUTH_REQUIRED_EVENT = "echo-auth-required";
const API_BASE = ECHO_AUTH_ENABLED ? "" : (process.env.NEXT_PUBLIC_ECHO_API || "http://localhost:8787").replace(/\/+$/, "");

export type ApiRole = "user" | "echo";
export type MemoryModelKind = "embedding" | "rerank";
export type MemoryModelSettings = { url: string; model: string; hasKey: boolean };
type MemoryModelConfig = Record<MemoryModelKind, MemoryModelSettings>;
// ---------- 思考（每个连接单独一份，后端 backend/src/thinking.js） ----------
export type ThinkMode = "off" | "native" | "cot";
export type ThinkFormat = "auto" | "openai" | "anthropic" | "gemini" | "deepseek";
export type ThinkEffort = "minimal" | "low" | "medium" | "high";
export type ThinkingSettings = { nativeStyle?: string; mode: ThinkMode; format: ThinkFormat; effort: ThinkEffort; budget: number; extra: string; cotPrompt: string };
export type ThinkingPlan = { mode: ThinkMode; format: Exclude<ThinkFormat, "auto">; extras: Record<string, unknown>; systemAppend: string; defaults: ThinkingSettings };

// ---------- Codex（ChatGPT 订阅，后端 backend/src/codex.js） ----------
export type CodexEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type CodexSettings = { model: string; effort: CodexEffort; showThinking: boolean };
export type CodexModel = { id: string; name: string; description: string; efforts: CodexEffort[]; defaultEffort: string; isDefault: boolean; images: boolean };
export type CodexLogin = { loginId: string; url: string; code: string; startedAt: number; error?: string };
export type CodexStatus = {
  installed: boolean; alive: boolean; loggedIn: boolean; busy: boolean;
  account: { type: string; email: string; planType: string } | null;
  hasThread: boolean; threadStartedAt: number; agentsChanged: boolean;
  mcp: Record<string, { status: string; error: string }>; login: CodexLogin | null; error: string;
};
export type ManualFile = { content: string; defaultContent?: string; savedAt?: number };

export type EchoSettings = Omit<Settings, "apiKey"> & {
  codex?: CodexSettings;
  thoughtTranslationReady?: boolean;
  officialModels?: Record<string, string>;
  officialThinking?: Record<string, ThinkingSettings>;
  memoryOwner?: "echo" | "serein";
  timeouts?: ReplyTimeouts;
  defaultTimeouts?: ReplyTimeouts;
  sereinSettingsUrl?: string;
};
type ChatModelDraft = { provider: string; presetId?: string; url?: string; apiKey?: string; anthropicWorkspaceId?: string };

/** 带 HTTP 状态码的错误：记忆本要区分 503（还没配置）和别的失败；status 0 = 根本没连上后端 */
export type ReplyErrorKind = "login" | "quota" | "network" | "param" | "timeout" | "busy" | "other";
export type ReplyAction = "retry" | "settings" | "relogin" | "continue";
export type GenSnapshot = {
  genId: string; messageId: string; windowId?: string; via: "api" | "codex"; model: string;
  status: "streaming" | "done" | "error" | "stopped"; text: string; reasoning: string; note: string;
  errorKind?: ReplyErrorKind; errorMessage?: string; actions?: ReplyAction[];
  startedAt: number; firstAt: number; lastAt: number; finishedAt: number;
};
export type ReplyTimeouts = { firstToken: number; codexFirstToken: number; stall: number; total: number };

export class ApiError extends Error {
  status: number;
  code?: string;
  savedAt?: number;
  kind?: ReplyErrorKind;
  actions?: ReplyAction[];
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function jsonFetch<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError("连不上 echo 后端", 0, "offline");
  }
  if (!res.ok) throw await requestError(res);
  return res.json();
}

async function requestError(res: Response) {
  const data = await res.json().catch(() => null);
  if (ECHO_AUTH_ENABLED && res.status === 401 && data?.error === "echo_login_required") {
    window.dispatchEvent(new Event(ECHO_AUTH_REQUIRED_EVENT));
  }
  if (data?.error === "no_key") return new ApiError("后端还没设置 API Key，请先到设置页保存", res.status, "no_key");
  const message = typeof data?.message === "string" && data.message;
  const err = new ApiError(message || `请求失败 (${res.status})`, res.status, typeof data?.error === "string" ? data.error : undefined);
  if (typeof data?.savedAt === "number") err.savedAt = data.savedAt; // 美化备份 409：云端那份的时间
  if (typeof data?.kind === "string") err.kind = data.kind;
  if (Array.isArray(data?.actions)) err.actions = data.actions;
  return err;
}

// ---------- 收藏本 ----------
export type FavoriteMsg = { id: string; role: ApiRole; text: string; at: number };
export type Favorite = { id: string; title: string; note: string; source: string; messages: FavoriteMsg[]; createdAt: number };

// ---------- 记忆本（字段对齐 Serein：Scene / Event / 喜好 + 人设；见 docs/MEMORY_GATEWAY.md） ----------
export type MemoryKind = "scene" | "event" | "preference" | "persona";
export type MemoryStatus = "active" | "archived";
export type PreferenceInfo = { subject: "user" | "ai" | "both"; polarity: "like" | "dislike"; keywords: string[]; reason: string };
export type MemorySource = { type: "chat" | "manual" | "import"; messageIds: string[] };
/** 记忆条目上可选的扩展字段（旧后端不认识也不会坏，只是不保存） */
export type MemoryExtra = {
  version?: number; shared?: boolean; readonly?: boolean; summaryEditable?: boolean; origin?: string;
  kind?: MemoryKind;
  cues?: string[];          // 召回线索，1–8 条，每条 ≤80 字（Serein write_scene 的 cues）
  domain?: string;          // 主域 / 分类
  status?: MemoryStatus;    // 归档后不进提示词、不参加召回
  favorite?: boolean;
  importance?: number;      // 1–5
  date?: string;            // YYYY-MM-DD，记忆发生的日子
  preference?: PreferenceInfo;
  source?: MemorySource;
};
export type RecallHit = { id: string; tab?: string; kind?: MemoryKind; title: string; text: string; score: number };

export interface ChatMsgInput {
  role: ApiRole;
  text: string;
}

/** 流式聊天：onDelta 每次收到增量文本；signal 用于停止生成 */
export async function chatStream(
  messages: ChatMsgInput[],
  opts: {
    model?: string; signal?: AbortSignal; onDelta: (text: string) => void; onReasoning?: (text: string) => void; onReasoningTranslated?: (text: string) => void;
    /** 后端的小提示：比如接口不认思考参数、已经去掉参数重试 */
    onNote?: (text: string) => void;
    /** 前端自己的消息 id：后端按这个存，之后删除 / 重新生成才对得上 */
    ids?: { user?: string; echo?: string };
    /** 重新生成本轮：用户消息已经在记录里，后端不再存一遍 */
    regenerate?: boolean;
    /** 这次生成的请求 ID：断开连接后端也不取消，回来按它接上；只更新带这个 ID 的消息 */
    genId?: string;
  }
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model: opts.model, streamFormat: "ndjson", ids: opts.ids, regenerate: opts.regenerate || undefined, genId: opts.genId }),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw Object.assign(new ApiError("连不上 echo 后端", 0, "offline"), { kind: "network" as const, actions: ["retry"] as ReplyAction[] });
  }
  if (!res.ok) throw await requestError(res);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("无响应流");
  const dec = new TextDecoder();
  const structured = res.headers.get("content-type")?.includes("application/x-ndjson");
  let buffer = "";
  const dispatch = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "reasoning_translated") opts.onReasoningTranslated?.(event.text);
    if (event.type === "reasoning") opts.onReasoning?.(event.text);
    if (event.type === "content") opts.onDelta(event.text);
    if (event.type === "note") opts.onNote?.(event.text);
    if (event.type === "error") throw Object.assign(new ApiError(event.text || "回复中途出错了", 502, "reply_error"), { kind: event.kind, actions: event.actions });
  };
  while (true) {
    let done: boolean, value: Uint8Array | undefined;
    try { ({ done, value } = await reader.read()); } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      // 流在中途断了（切后台、隧道断开）：后端可能还在写，交给调用方去按 genId 接上
      throw Object.assign(new ApiError("连接断了一下", 0, "stream_lost"), { kind: "network" as const, actions: ["retry"] as ReplyAction[] });
    }
    const chunk = done ? dec.decode() : dec.decode(value, { stream: true });
    if (structured) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(dispatch);
      if (done) dispatch(buffer);
    } else if (chunk) {
      opts.onDelta(chunk);
    }
    if (done) break;
  }
}

export const api = {
  base: API_BASE,

  health: () => fetch(`${API_BASE}/api/health`).then((r) => r.json()),
  getSession: () => jsonFetch<{ authenticated: boolean }>("/api/auth/session", { cache: "no-store" }),
  login: (password: string) => jsonFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => jsonFetch("/api/auth/logout", { method: "POST" }),

  // 聊天历史
  getHistory: () => jsonFetch<{ messages: any[] }>("/api/chat/history"),
  chatStream,
  /** 进行中 / 刚结束的回复（回到聊天页时接上） */
  chatActive: () => jsonFetch<{ generations: GenSnapshot[] }>("/api/chat/active", { cache: "no-store" }),
  chatGeneration: (genId: string) => jsonFetch<GenSnapshot>(`/api/chat/generations/${encodeURIComponent(genId)}`, { cache: "no-store" }),
  /** 「停止」：真正让后端取消这次生成 */
  chatStop: (genId: string) => jsonFetch<{ ok: true; stopped: boolean }>("/api/chat/stop", { method: "POST", body: JSON.stringify({ genId }) }),
  /** 批量删除聊天记录（多选删除、重新生成前删旧回复） */
  deleteMessages: (ids: string[]) =>
    jsonFetch<{ ok: true; deleted: number }>("/api/chat/messages", { method: "DELETE", body: JSON.stringify({ ids }) }),

  // 收藏本
  getFavorites: () => jsonFetch<{ favorites: Favorite[] }>("/api/favorites", { cache: "no-store" }),
  addFavorite: (f: { messages: FavoriteMsg[]; title?: string; note?: string; source?: string }) =>
    jsonFetch<Favorite>("/api/favorites", { method: "POST", body: JSON.stringify(f) }),
  updateFavorite: (id: string, patch: { title?: string; note?: string }) =>
    jsonFetch<Favorite>(`/api/favorites/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteFavorite: (id: string) => jsonFetch(`/api/favorites/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // 美化设置云端备份（不含图片）
  getBeauty: () => jsonFetch<{ beauty: unknown; savedAt: number }>("/api/beauty", { cache: "no-store" }),
  putBeauty: (beauty: unknown, savedAt: number) =>
    jsonFetch<{ ok: true; savedAt: number }>("/api/beauty", { method: "PUT", body: JSON.stringify({ beauty, savedAt }) }),

  // 设置（Key 只走后端，前端拿到的已脱敏）
  getSettings: () => jsonFetch<EchoSettings>("/api/settings", { cache: "no-store" }),
  saveSettings: (patch: Record<string, unknown>) => jsonFetch<EchoSettings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  createPreset: (p: { name: string; url: string; apiKey?: string; model?: string; activate?: boolean }) =>
    jsonFetch<EchoSettings>("/api/presets", { method: "POST", body: JSON.stringify(p) }),
  updatePreset: (id: string, p: { name?: string; url?: string; apiKey?: string; model?: string; activate?: boolean; thinking?: Partial<ThinkingSettings> }) =>
    jsonFetch<EchoSettings>(`/api/presets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(p) }),
  deletePreset: (id: string) => jsonFetch<EchoSettings>(`/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** 思考设置预览：后端算出「最终会加到请求里的参数」，和聊天时同一个函数 */
  previewThinking: (body: { thinking: Partial<ThinkingSettings>; provider: string; model?: string }) =>
    jsonFetch<ThinkingPlan>("/api/settings/thinking-preview", { method: "POST", body: JSON.stringify(body) }),
  testConnection: () => jsonFetch<{ ok: boolean; message: string }>("/api/settings/test", { method: "POST" }),
  listChatModels: (draft: ChatModelDraft) =>
    jsonFetch<{ models: string[] }>("/api/settings/chat-models", { method: "POST", body: JSON.stringify(draft) }),
  // 拉取模型列表（走后端 /models，可选搜索）
  getModels: (q?: string) => jsonFetch<{ models: string[]; error?: string; message?: string }>(`/api/models${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  // Codex（ChatGPT 订阅）
  codexStatus: () => jsonFetch<CodexStatus>("/api/codex/status", { cache: "no-store" }),
  codexModels: () => jsonFetch<{ models: CodexModel[] }>("/api/codex/models", { cache: "no-store" }),
  codexResetThread: () => jsonFetch<{ ok: true }>("/api/codex/thread/reset", { method: "POST", body: "{}" }),
  codexLogin: () => jsonFetch<{ loggedIn: boolean } & Partial<CodexLogin>>("/api/codex/login", { method: "POST" }),
  codexCancelLogin: () => jsonFetch<{ ok: true }>("/api/codex/login/cancel", { method: "POST" }),

  // 说明书（echo 的 AGENTS.md）
  getManual: () => jsonFetch<ManualFile>("/api/manual", { cache: "no-store" }),
  saveManual: (content: string) => jsonFetch<ManualFile>("/api/manual", { method: "PUT", body: JSON.stringify({ content }) }),
  resetManual: () => jsonFetch<ManualFile>("/api/manual/reset", { method: "POST" }),

  // 记忆
  getMemoryModels: () => jsonFetch<MemoryModelConfig>("/api/settings/memory-models", { cache: "no-store" }),
  saveMemoryModel: (kind: MemoryModelKind, settings: { url: string; model: string; apiKey?: string }) =>
    jsonFetch<MemoryModelConfig>(`/api/settings/memory-models/${kind}`, { method: "PUT", body: JSON.stringify(settings) }),
  listMemoryModels: (kind: MemoryModelKind, settings: { url: string; apiKey?: string }) =>
    jsonFetch<{ models: string[] }>(`/api/settings/memory-models/${kind}/models`, { method: "POST", body: JSON.stringify(settings) }),
  testMemoryModel: (kind: MemoryModelKind) =>
    jsonFetch<{ ok: boolean; message: string }>(`/api/settings/memory-models/${kind}/test`, { method: "POST" }),
  saveSummary: (id:string,text:string,version:number) => jsonFetch(`/api/memory/${encodeURIComponent(id)}/summary`,{method:"PUT",body:JSON.stringify({text,version})}),
  getProject: () => jsonFetch<{repo:string; branch:string; version:string; text:string; writable:boolean}>("/api/project/instructions", {cache:"no-store"}),
  saveProject: (text:string,version:string) => jsonFetch<{version:string;commit:string}>("/api/project/instructions", {method:"PUT",body:JSON.stringify({text,version})}),
  getMemory: () => jsonFetch<{ shared?: boolean; memory: any[]; reminders: any[] }>("/api/memory"),
  addMemory: (m: { tab?: string; title?: string; text: string; pinned?: boolean } & MemoryExtra) =>
    jsonFetch("/api/memory", { method: "POST", body: JSON.stringify(m) }),
  updateMemory: (id: string, patch: Record<string, unknown>) =>
    jsonFetch(`/api/memory/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteMemory: (id: string, version?: number) => jsonFetch(`/api/memory/${encodeURIComponent(id)}?version=${version ?? ""}`, { method: "DELETE" }),
  /** 记忆召回测试：先向量筛选再重排；没配置模型时后端回 503 memory_recall_unconfigured */
  recallMemory: (query: string, limit = 5) =>
    jsonFetch<{ results: RecallHit[] }>("/api/memory/recall", { method: "POST", body: JSON.stringify({ query, limit }) }),

  // 提醒
  addReminder: (r: { text: string; time: number; pinned?: boolean }) =>
    jsonFetch("/api/reminders", { method: "POST", body: JSON.stringify(r) }),
  updateReminder: (id: string, patch: Record<string, unknown>) =>
    jsonFetch(`/api/reminders/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteReminder: (id: string) => jsonFetch(`/api/reminders/${id}`, { method: "DELETE" }),

  // 文件
  getFiles: () => jsonFetch<{ files: any[] }>("/api/files"),
  getFile: (id: string) => jsonFetch(`/api/files/${id}`),
  addFile: (f: { kind: string; name: string; content: string; via?: string }) =>
    jsonFetch("/api/files", { method: "POST", body: JSON.stringify(f) }),
  deleteFile: (id: string) => jsonFetch(`/api/files/${id}`, { method: "DELETE" }),
};
