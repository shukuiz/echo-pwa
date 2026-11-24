// 后端 API 封装：聊天流式、记忆、文件、设置、提醒
// 后端地址可用 NEXT_PUBLIC_ECHO_API 覆盖，默认本机 8787（开发/同机部署）
export const ECHO_AUTH_ENABLED = process.env.NEXT_PUBLIC_ECHO_AUTH === "1";
export const ECHO_AUTH_REQUIRED_EVENT = "echo-auth-required";
const API_BASE = ECHO_AUTH_ENABLED ? "" : (process.env.NEXT_PUBLIC_ECHO_API || "http://localhost:8787").replace(/\/+$/, "");

export type ApiRole = "user" | "echo";
export type MemoryModelKind = "embedding" | "rerank";
export type MemoryModelSettings = { url: string; model: string; hasKey: boolean };
type MemoryModelConfig = Record<MemoryModelKind, MemoryModelSettings>;

async function jsonFetch<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });
  if (!res.ok) throw await requestError(res);
  return res.json();
}

async function requestError(res: Response) {
  const data = await res.json().catch(() => null);
  if (ECHO_AUTH_ENABLED && res.status === 401 && data?.error === "echo_login_required") {
    window.dispatchEvent(new Event(ECHO_AUTH_REQUIRED_EVENT));
  }
  if (data?.error === "no_key") return new Error("后端还没设置 API Key，请先到设置页保存");
  const message = typeof data?.message === "string" && data.message;
  return new Error(message || `请求失败 (${res.status})`);
}

export interface ChatMsgInput {
  role: ApiRole;
  text: string;
}

/** 流式聊天：onDelta 每次收到增量文本；signal 用于停止生成 */
export async function chatStream(
  messages: ChatMsgInput[],
  opts: { model?: string; signal?: AbortSignal; onDelta: (text: string) => void }
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: opts.model }),
    signal: opts.signal,
  });
  if (!res.ok) throw await requestError(res);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("无响应流");
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, { stream: true });
    if (chunk) opts.onDelta(chunk);
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

  // 设置（Key 只走后端，前端拿到的已脱敏）
  getSettings: () => jsonFetch("/api/settings"),
  saveSettings: (patch: Record<string, unknown>) => jsonFetch("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  createPreset: (p: { name: string; url: string; apiKey?: string }) => jsonFetch("/api/presets", { method: "POST", body: JSON.stringify(p) }),
  updatePreset: (id: string, p: { name?: string; url?: string; apiKey?: string }) =>
    jsonFetch(`/api/presets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(p) }),
  deletePreset: (id: string) => jsonFetch(`/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  testConnection: () => jsonFetch("/api/settings/test", { method: "POST" }),
  // 拉取模型列表（走后端 /models，可选搜索）
  getModels: (q?: string) => jsonFetch<{ models: string[]; error?: string; message?: string }>(`/api/models${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  // 记忆
  getMemoryModels: () => jsonFetch<MemoryModelConfig>("/api/settings/memory-models", { cache: "no-store" }),
  saveMemoryModel: (kind: MemoryModelKind, settings: { url: string; model: string; apiKey?: string }) =>
    jsonFetch<MemoryModelConfig>(`/api/settings/memory-models/${kind}`, { method: "PUT", body: JSON.stringify(settings) }),
  testMemoryModel: (kind: MemoryModelKind) =>
    jsonFetch<{ ok: boolean; message: string }>(`/api/settings/memory-models/${kind}/test`, { method: "POST" }),
  getMemory: () => jsonFetch<{ memory: any[]; reminders: any[] }>("/api/memory"),
  addMemory: (m: { tab: string; title?: string; text: string; pinned?: boolean }) =>
    jsonFetch("/api/memory", { method: "POST", body: JSON.stringify(m) }),
  updateMemory: (id: string, patch: Record<string, unknown>) =>
    jsonFetch(`/api/memory/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteMemory: (id: string) => jsonFetch(`/api/memory/${id}`, { method: "DELETE" }),

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
