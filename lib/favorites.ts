// 收藏本数据层：后端 /api/favorites 为准；连不上后端（本地开发 / 离线）时退回 localStorage，和 lib/store 的离线兜底一致
import { api, ApiError, ECHO_AUTH_ENABLED, type Favorite, type FavoriteMsg } from "./api";
import { seedFavorites } from "./mock";

const LOCAL_KEY = "echo-favorites-v1";

export type { Favorite, FavoriteMsg };
export type FavSource = "cloud" | "local";

const offline = (e: unknown) => e instanceof ApiError && e.status === 0;
const uid = () => "fav" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

function readLocal(): Favorite[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return seedFavorites;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function writeLocal(list: Favorite[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch {}
}

/** 读收藏：返回列表和来源（本机兜底时页面会提示一下） */
export async function listFavorites(): Promise<{ list: Favorite[]; source: FavSource }> {
  try {
    const { favorites } = await api.getFavorites();
    return { list: favorites, source: "cloud" };
  } catch (e) {
    if (!ECHO_AUTH_ENABLED && offline(e)) return { list: readLocal(), source: "local" };
    throw e;
  }
}

/** 收藏一条或多条消息（多条 = 一个收藏条目） */
export async function addFavorite(messages: FavoriteMsg[], title?: string): Promise<{ item: Favorite; source: FavSource }> {
  const sorted = [...messages].sort((a, b) => a.at - b.at);
  try {
    return { item: await api.addFavorite({ messages: sorted, title, source: "chat" }), source: "cloud" };
  } catch (e) {
    if (ECHO_AUTH_ENABLED || !offline(e)) throw e;
    const first = sorted[0]?.text.replace(/\s+/g, " ").trim() ?? "";
    const item: Favorite = { id: uid(), title: (title || first).slice(0, 60), note: "", source: "chat", messages: sorted, createdAt: Date.now() };
    writeLocal([item, ...readLocal()]);
    return { item, source: "local" };
  }
}

export async function removeFavorite(id: string, source: FavSource) {
  if (source === "local") { writeLocal(readLocal().filter((f) => f.id !== id)); return; }
  await api.deleteFavorite(id);
}

export async function renameFavorite(id: string, title: string, source: FavSource) {
  if (source === "local") { writeLocal(readLocal().map((f) => (f.id === id ? { ...f, title } : f))); return; }
  await api.updateFavorite(id, { title });
}
