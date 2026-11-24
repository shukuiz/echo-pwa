// 记忆本数据层：页面只和这里打交道，换成 Serein 网关时只改这一层（见 docs/MEMORY_GATEWAY.md）
// 现在：读写走 echo 后端已有的 /api/memory（store.json），召回测试走 POST /api/memory/recall；
// 后端连不上（本地开发 / 离线、且没开登录）时，记忆在本机改、召回用关键词模拟，页面会标出「本机模拟」。
import { api, ApiError, ECHO_AUTH_ENABLED, type MemoryExtra, type MemoryKind, type RecallHit } from "./api";
import type { MemoryItem, MemoryTab } from "./store";

export type { MemoryKind, RecallHit };

export const KIND_META: Record<MemoryKind, { n: string; en: string; d: string; icon: string }> = {
  scene: { n: "场景", en: "Scene", d: "echo 想记住的片段、感受、约定", icon: "drop" },
  event: { n: "事件", en: "Event", d: "按聊天整理的「发生了什么」", icon: "cal" },
  preference: { n: "喜好", en: "Pref", d: "喜欢 / 不喜欢的短便签", icon: "heart" },
  persona: { n: "人设", en: "Persona", d: "echo 是谁、怎么说话", icon: "star" },
};
export const KINDS = Object.keys(KIND_META) as MemoryKind[];

export const kindToTab = (k: MemoryKind): MemoryTab => (k === "persona" ? "persona" : k === "event" ? "summary" : "text");
export const tabToKind = (t: MemoryTab): MemoryKind => (t === "persona" ? "persona" : t === "summary" ? "event" : "scene");
/** 旧数据没有 kind：按 tab 推 */
export const kindOf = (m: Pick<MemoryItem, "kind" | "tab">): MemoryKind => m.kind ?? tabToKind(m.tab);

export type MemoryDraft = { title: string; text: string; pinned?: boolean } & MemoryExtra & { kind: MemoryKind };

const offline = (e: unknown) => e instanceof ApiError && e.status === 0;
const localId = () => "local-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/** 新增：返回存好的条目；mode=local 表示后端没连上，只存在了本机 */
export async function createMemory(d: MemoryDraft): Promise<{ item: MemoryItem; mode: "cloud" | "local" }> {
  const title = d.title.trim() || d.text.trim().slice(0, 12);
  const body = { ...d, title, text: d.text.trim(), tab: kindToTab(d.kind) };
  try {
    const item = (await api.addMemory(body)) as MemoryItem;
    return { item: { ...body, ...item }, mode: "cloud" };
  } catch (e) {
    if (ECHO_AUTH_ENABLED || !offline(e)) throw e;
    const now = Date.now();
    return { item: { status: "active", pinned: false, ...body, id: localId(), createdAt: now, updatedAt: now }, mode: "local" };
  }
}

export async function updateMemory(id: string, patch: Partial<MemoryDraft>): Promise<"cloud" | "local"> {
  const body: Record<string, unknown> = { ...patch };
  if (patch.kind) body.tab = kindToTab(patch.kind);
  try {
    await api.updateMemory(id, body);
    return "cloud";
  } catch (e) {
    if (ECHO_AUTH_ENABLED || !(offline(e) || id.startsWith("local-"))) throw e;
    return "local";
  }
}

export async function deleteMemory(id: string): Promise<"cloud" | "local"> {
  try {
    await api.deleteMemory(id);
    return "cloud";
  } catch (e) {
    if (ECHO_AUTH_ENABLED || !(offline(e) || id.startsWith("local-"))) throw e;
    return "local";
  }
}

export type RecallOutcome =
  | { state: "ok"; hits: RecallHit[]; mock?: boolean }
  | { state: "unconfigured"; message: string }
  | { state: "error"; message: string };

/** 召回测试：后端 503 = 还没配置向量 / 重排模型；连不上后端时用关键词在本机模拟 */
export async function testRecall(query: string, local: MemoryItem[], limit = 5): Promise<RecallOutcome> {
  try {
    return { state: "ok", hits: (await api.recallMemory(query, limit)).results };
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) return { state: "unconfigured", message: e.message };
    if (!ECHO_AUTH_ENABLED && offline(e)) return { state: "ok", hits: mockRecall(query, local, limit), mock: true };
    return { state: "error", message: (e as Error).message || "召回失败" };
  }
}

/** 本机模拟：按字重合打分（只给界面看个样子，不代表真实召回质量） */
export function mockRecall(query: string, list: MemoryItem[], limit = 5): RecallHit[] {
  const q = Array.from(new Set(query.replace(/\s+/g, "")));
  if (!q.length) return [];
  return list
    .filter((m) => m.status !== "archived" && kindOf(m) !== "persona")
    .map((m) => {
      const hay = `${m.title}${m.text}${(m.cues || []).join("")}${(m.preference?.keywords || []).join("")}`;
      const hit = q.filter((c) => hay.includes(c)).length;
      return { id: m.id, kind: kindOf(m), title: m.title, text: m.text, score: Math.round((hit / q.length) * 100) / 100 };
    })
    .filter((h) => h.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
