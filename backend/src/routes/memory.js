// 记忆读写：结构化记忆(persona/text/summary) + 提醒，存后端 memory/store.json，实时持久化
import { paths, readJSON, writeJSON, uid, DATA_DIR } from "../storage.js";
import { createMemoryRecall, MemoryRecallError } from "../memory-recall.js";

// ---- 记忆条目字段（对齐 Serein 的 Scene / Event / 喜好；旧字段 tab 保留兼容） ----
// kind ↔ tab：persona→persona，event→summary，scene / preference→text
const KINDS = ["scene", "event", "preference", "persona"];
const TABS = ["persona", "text", "summary"];
const kindToTab = (k) => (k === "persona" ? "persona" : k === "event" ? "summary" : "text");
const tabToKind = (t) => (t === "persona" ? "persona" : t === "summary" ? "event" : "scene");
const shortStr = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const strList = (v, n, max) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, max)).filter(Boolean))].slice(0, n) : undefined);

/** 只挑认识的可选字段，坏值直接丢掉；返回要合并进条目的补丁 */
function extraFields(body) {
  const out = {};
  if (KINDS.includes(body.kind)) { out.kind = body.kind; out.tab = kindToTab(body.kind); }
  const cues = strList(body.cues, 8, 80); if (cues) out.cues = cues;
  const domain = shortStr(body.domain, 40); if (domain !== undefined) out.domain = domain;
  if (body.status === "active" || body.status === "archived") out.status = body.status;
  if (typeof body.favorite === "boolean") out.favorite = body.favorite;
  if (Number.isInteger(body.importance) && body.importance >= 1 && body.importance <= 5) out.importance = body.importance;
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) out.date = body.date;
  if (body.preference && typeof body.preference === "object") {
    const p = body.preference;
    out.preference = {
      subject: ["user", "ai", "both"].includes(p.subject) ? p.subject : "user",
      polarity: p.polarity === "dislike" ? "dislike" : "like",
      keywords: strList(p.keywords, 12, 40) || [],
      reason: shortStr(p.reason, 300) || "",
    };
  }
  if (body.source && typeof body.source === "object") {
    const type = ["chat", "manual", "import"].includes(body.source.type) ? body.source.type : "manual";
    out.source = { type, messageIds: strList(body.source.messageIds, 200, 64) || [] };
  }
  return out;
}

async function load() {
  return await readJSON(paths.store(DATA_DIR), { memory: [], reminders: [] });
}
async function save(store) {
  await writeJSON(paths.store(DATA_DIR), store);
}

export default async function memoryRoute(app) {
  const recall = createMemoryRecall(load);

  app.post("/api/memory/recall", { bodyLimit: 8192 }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { query, limit = 2 } = req.body || {};
    const text = typeof query === "string" ? query.trim() : "";
    if (!text || text.length > 1000 || !Number.isInteger(limit) || limit < 1 || limit > 20) {
      return reply.code(400).send({ error: "bad_input", message: "query 需要 1–1000 个字符，limit 需要是 1–20 的整数" });
    }
    try {
      return { results: await recall(text, limit) };
    } catch (error) {
      if (!(error instanceof MemoryRecallError)) throw error;
      return reply.code(error.status).send({ error: error.code, message: error.message });
    }
  });

  // 读全部记忆 + 提醒
  app.get("/api/memory", async () => {
    const store = await load();
    return { memory: store.memory || [], reminders: store.reminders || [] };
  });

  // 新增记忆 { tab, title, text }
  app.post("/api/memory", async (req, reply) => {
    const body = req.body || {};
    const { title = "", text = "", pinned = false } = body;
    if (typeof text !== "string" || !text.trim()) { reply.code(400); return { error: "empty", message: "内容不能为空" }; }
    if (text.length > 20000) { reply.code(400); return { error: "too_long", message: "内容太长了（最多 20000 字）" }; }
    const extra = extraFields(body);
    const tab = extra.tab || body.tab;
    if (!TABS.includes(tab)) { reply.code(400); return { error: "bad_tab" }; }
    const store = await load();
    const now = Date.now();
    const item = {
      id: uid(), tab, kind: tabToKind(tab), title: String(title).trim() || text.trim().slice(0, 10), text: text.trim(), pinned: !!pinned,
      status: "active", createdAt: now, updatedAt: now, ...extra,
    };
    store.memory.unshift(item);
    await save(store);
    return item;
  });

  // 修改记忆（含置顶）{ title?, text?, pinned?, tab? }
  app.put("/api/memory/:id", async (req, reply) => {
    const store = await load();
    const m = store.memory.find((x) => x.id === req.params.id);
    if (!m) { reply.code(404); return { error: "not_found" }; }
    const body = req.body || {};
    const { title, text, pinned, tab } = body;
    if (title !== undefined) m.title = String(title).slice(0, 200);
    if (text !== undefined) {
      if (typeof text !== "string" || !text.trim() || text.length > 20000) { reply.code(400); return { error: "bad_text", message: "内容不能为空，最多 20000 字" }; }
      m.text = text;
    }
    if (pinned !== undefined) m.pinned = !!pinned;
    if (tab !== undefined && TABS.includes(tab)) { m.tab = tab; m.kind = tabToKind(tab); }
    Object.assign(m, extraFields(body));
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
