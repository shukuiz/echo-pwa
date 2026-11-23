// 记忆读写：结构化记忆(persona/text/summary) + 提醒，存后端 memory/store.json，实时持久化
import { paths, readJSON, writeJSON, uid, DATA_DIR } from "../storage.js";

async function load() {
  return await readJSON(paths.store(DATA_DIR), { memory: [], reminders: [] });
}
async function save(store) {
  await writeJSON(paths.store(DATA_DIR), store);
}

export default async function memoryRoute(app) {
  // 读全部记忆 + 提醒
  app.get("/api/memory", async () => {
    const store = await load();
    return { memory: store.memory || [], reminders: store.reminders || [] };
  });

  // 新增记忆 { tab, title, text }
  app.post("/api/memory", async (req, reply) => {
    const { tab, title = "", text = "", pinned = false } = req.body || {};
    if (!text.trim()) { reply.code(400); return { error: "empty", message: "内容不能为空" }; }
    if (!["persona", "text", "summary"].includes(tab)) { reply.code(400); return { error: "bad_tab" }; }
    const store = await load();
    const item = { id: uid(), tab, title: title.trim() || text.trim().slice(0, 10), text: text.trim(), pinned: !!pinned, updatedAt: Date.now() };
    store.memory.unshift(item);
    await save(store);
    return item;
  });

  // 修改记忆（含置顶）{ title?, text?, pinned?, tab? }
  app.put("/api/memory/:id", async (req, reply) => {
    const store = await load();
    const m = store.memory.find((x) => x.id === req.params.id);
    if (!m) { reply.code(404); return { error: "not_found" }; }
    const { title, text, pinned, tab } = req.body || {};
    if (title !== undefined) m.title = title;
    if (text !== undefined) m.text = text;
    if (pinned !== undefined) m.pinned = !!pinned;
    if (tab !== undefined && ["persona", "text", "summary"].includes(tab)) m.tab = tab;
    m.updatedAt = Date.now();
    await save(store);
    return m;
  });

  // 删除记忆
  app.delete("/api/memory/:id", async (req, reply) => {
    const store = await load();
    const before = store.memory.length;
    store.memory = store.memory.filter((x) => x.id !== req.params.id);
    if (store.memory.length === before) { reply.code(404); return { error: "not_found" }; }
    await save(store);
    return { ok: true };
  });

  /* ---- 提醒 ---- */
  app.post("/api/reminders", async (req, reply) => {
    const { text = "", time, pinned = false } = req.body || {};
    if (!text.trim() || !time) { reply.code(400); return { error: "bad_input" }; }
    const store = await load();
    const item = { id: uid(), text: text.trim(), time: Number(time), done: false, pinned: !!pinned };
    store.reminders.push(item);
    await save(store);
    return item;
  });

  app.put("/api/reminders/:id", async (req, reply) => {
    const store = await load();
    const r = store.reminders.find((x) => x.id === req.params.id);
    if (!r) { reply.code(404); return { error: "not_found" }; }
    const { text, time, done, pinned } = req.body || {};
    if (text !== undefined) r.text = text;
    if (time !== undefined) r.time = Number(time);
    if (done !== undefined) r.done = !!done;
    if (pinned !== undefined) r.pinned = !!pinned;
    await save(store);
    return r;
  });

  app.delete("/api/reminders/:id", async (req, reply) => {
    const store = await load();
    store.reminders = store.reminders.filter((x) => x.id !== req.params.id);
    await save(store);
    return { ok: true };
  });
}
