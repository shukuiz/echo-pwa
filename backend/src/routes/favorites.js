// 收藏本：聊天里收藏的单条或多条消息，一次收藏 = 一个条目，存 memory/favorites.json（gitignore）
import { paths, readJSON, writeJSON, uid, DATA_DIR } from "../storage.js";

const MAX_ITEMS = 2000;
const MAX_MESSAGES = 200;
const MAX_TEXT = 20000;

const load = async () => {
  const data = await readJSON(paths.favorites(DATA_DIR), { favorites: [] });
  return Array.isArray(data.favorites) ? data : { favorites: [] };
};
const save = (data) => writeJSON(paths.favorites(DATA_DIR), data);

/** 只收认识的字段：role 只有 user / echo，文字截断，时间是数字 */
function cleanMessages(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const m of list.slice(0, MAX_MESSAGES)) {
    if (!m || typeof m !== "object" || typeof m.text !== "string" || !m.text.trim()) continue;
    out.push({
      id: typeof m.id === "string" ? m.id.slice(0, 64) : uid(),
      role: m.role === "user" ? "user" : "echo",
      text: m.text.slice(0, MAX_TEXT),
      at: Number.isFinite(m.at) ? m.at : Date.now(),
    });
  }
  return out.length ? out : null;
}

export default async function favoritesRoute(app) {
  app.get("/api/favorites", async () => {
    const { favorites } = await load();
    return { favorites };
  });

  // 新增 { messages: [{id, role, text, at}], title?, note?, source? }
  app.post("/api/favorites", { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    const body = req.body || {};
    const messages = cleanMessages(body.messages);
    if (!messages) { reply.code(400); return { error: "bad_input", message: "要收藏的消息不能为空" }; }
    const data = await load();
    if (data.favorites.length >= MAX_ITEMS) { reply.code(409); return { error: "full", message: `收藏本最多 ${MAX_ITEMS} 条，先删掉一些旧的吧` }; }
    const first = messages[0].text.replace(/\s+/g, " ").trim();
    const item = {
      id: uid(),
      title: (typeof body.title === "string" && body.title.trim() ? body.title.trim() : first).slice(0, 60),
      note: typeof body.note === "string" ? body.note.slice(0, 500) : "",
      source: body.source === "chat" || body.source == null ? "chat" : String(body.source).slice(0, 20),
      messages,
      createdAt: Date.now(),
    };
    data.favorites.unshift(item);
    await save(data);
    return item;
  });

  // 改标题 / 备注
  app.put("/api/favorites/:id", { bodyLimit: 8192 }, async (req, reply) => {
    const data = await load();
    const f = data.favorites.find((x) => x.id === req.params.id);
    if (!f) { reply.code(404); return { error: "not_found" }; }
    const { title, note } = req.body || {};
    if (typeof title === "string" && title.trim()) f.title = title.trim().slice(0, 60);
    if (typeof note === "string") f.note = note.slice(0, 500);
    await save(data);
    return f;
  });

  app.delete("/api/favorites/:id", async (req, reply) => {
    const data = await load();
    const before = data.favorites.length;
    data.favorites = data.favorites.filter((x) => x.id !== req.params.id);
    if (data.favorites.length === before) { reply.code(404); return { error: "not_found" }; }
    await save(data);
    return { ok: true };
  });
}
