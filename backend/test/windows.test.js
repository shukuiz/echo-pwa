// 更新点4：换窗 —— 迁移（现有聊天 = 第 1 窗）、写窗影、归档只读、新 X-Serein-Window-ID、/resume、Codex 预装、失败不丢旧聊天
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Fastify from "fastify";

let app, model, serein, directory, storage, gatewayBase;
const calls = { shadow: [], settings: [], resume: [], chat: [] };
let shadowFails = false;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "echo-windows-"));
  process.env.ECHO_DATA_DIR = directory;
  storage = await import("../src/storage.js");
  await storage.ensureDataTree(directory);
  // 已经在聊的旧版聊天记录（没有 windowId）
  await storage.writeJSON(storage.paths.chat(directory), { messages: [
    { id: "m1", role: "user", text: "今天下雨了", at: 1795500000000 },
    { id: "m2", role: "echo", text: "记得带伞 ☂", at: 1795500001000 },
  ] });

  // 假 Serein 核心（Serein 自己的接口形状）
  serein = Fastify();
  serein.get("/api/window-shadows", async (req, reply) => {
    if (req.query.window_id) return reply.code(404).send({ detail: "Window Shadow not found" });
    const last = calls.shadow.at(-1);
    return { status: "ok", windows: last ? [{ window_id: last.window_id, title: last.title, revision: 1, sections: { user_view: last.user_view, self_view: last.self_view, recent_events: last.recent_events }, content: "## 我眼中的你\n\n" + last.user_view }] : [], portrait_views: {} };
  });
  serein.post("/v1/extensions/window_shadow_write", async (req, reply) => {
    if (shadowFails) return reply.code(500).send({ detail: "boom" });
    calls.shadow.push(req.body);
    return { id: "shadow:" + req.body.window_id, window_id: req.body.window_id, revision: 1, status: "saved" };
  });
  serein.patch("/v1/settings", async (req) => { calls.settings.push(req.body); return { ok: true }; });
  serein.post("/v1/extensions/resume", async (req) => {
    calls.resume.push(req.body);
    const pageTwo = req.body.cursor === "c:1";
    return pageTwo
      ? { collection_id: "c", items: [{ id: "e1", kind: "event", section: "recent_event", title: "下雨", revision: 1, body_md: "她带了伞", body_offset: 0 }], has_more: false, next_cursor: null, selection: req.body.selection, total_recent_events: 1 }
      : { collection_id: "c", items: [{ id: "shadow:main", kind: "shadow", section: "latest_shadow", title: "雨天", revision: 1, body_md: "## 我眼中的你\n\n爱下雨天", body_offset: 0 }], has_more: true, next_cursor: "c:1", selection: req.body.selection, total_recent_events: 1 };
  });
  const coreBase = await serein.listen({ host: "127.0.0.1", port: 0 });
  process.env.ECHO_SEREIN_CORE_URL = coreBase;
  process.env.ECHO_SEREIN_TOKEN = "test-gateway-key";

  // 假的 Serein 网关 / 模型
  model = Fastify();
  model.post("/v1/chat/completions", async (req, reply) => {
    if (!req.body.stream) {
      return { choices: [{ message: { content: '```json\n{"title":"雨天这一窗","user_view":"她喜欢下雨天","self_view":"我学会了提醒带伞","recent_events":"聊了下雨"}\n```' } }] };
    }
    calls.chat.push({ messages: req.body.messages, window: req.headers["x-serein-window-id"] });
    reply.header("content-type", "text/event-stream");
    return `data: ${JSON.stringify({ choices: [{ delta: { content: "接上啦" } }] })}\n\ndata: [DONE]\n\n`;
  });
  gatewayBase = (await model.listen({ host: "127.0.0.1", port: 0 })) + "/v1";
  process.env.ECHO_SEREIN_API_BASE = gatewayBase;
  await storage.writeJSON(storage.paths.config(directory), {
    apiMode: "custom", provider: "openai", officialKeys: {},
    presets: [{ id: "s", name: "Serein", url: gatewayBase, apiKey: "test-gateway-key" }], activePresetId: "s", model: "m",
  });

  const { default: chatRoute } = await import("../src/routes/chat.js");
  const { default: windowsRoute } = await import("../src/routes/windows.js");
  app = Fastify();
  await app.register(chatRoute);
  await app.register(windowsRoute);
});

after(async () => {
  await app?.close(); await model?.close(); await serein?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const get = async (url) => (await app.inject({ method: "GET", url })).json();
const post = (url, payload) => app.inject({ method: "POST", url, payload });

test("existing chat migrates safely: it becomes window 1 (Serein window main), nothing moves", async () => {
  const list = await get("/api/windows");
  assert.equal(list.activeId, "w1");
  assert.equal(list.mode, "resume");
  assert.equal(list.windows[0].sereinWindowId, "main");
  assert.equal(list.windows[0].messageCount, 2);
  const hist = await get("/api/chat/history");
  assert.deepEqual(hist.messages.map((m) => m.id), ["m1", "m2"]);
  assert.equal(hist.windowId, "w1");
});

test("chat in window 1 sends X-Serein-Window-ID main", async () => {
  const res = await post("/api/chat", { streamFormat: "ndjson", messages: [{ role: "user", text: "今天下雨了" }, { role: "echo", text: "记得带伞 ☂" }, { role: "user", text: "嗯" }], ids: { user: "m3", echo: "m4" }, genId: "gen-w1-a" });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(calls.chat.at(-1).window, "main");
});

test("preview reads every resume page with the chosen selection", async () => {
  const r = await post("/api/windows/preview", { selection: { recent_event_limit: 12, recent_scenes: false } });
  assert.equal(r.statusCode, 200, r.body);
  const body = r.json();
  assert.deepEqual(body.items.map((i) => i.id), ["shadow:main", "e1"]);
  assert.equal(calls.resume.at(-1).selection.recent_event_limit, 12);
  assert.equal(calls.resume[0].source_session_id, "main");
  const bad = await post("/api/windows/preview", { selection: { recent_event_limit: 99 } });
  assert.equal(bad.statusCode, 400);
});

test("shadow failure stops the switch and keeps the old chat", async () => {
  shadowFails = true;
  const r = await post("/api/windows/switch", { selection: {} });
  shadowFails = false;
  assert.equal(r.statusCode, 502);
  assert.equal(r.json().stage, "shadow");
  assert.match(r.json().message, /Serein 返回 500/);
  assert.equal((await get("/api/windows")).activeId, "w1");
  assert.equal((await get("/api/chat/history")).messages.length, 4);
});

test("switch: model writes the shadow (three sections), old window archived read-only, new window empty with a new Serein window id", async () => {
  const r = await post("/api/windows/switch", { selection: { recent_event_limit: 10, recent_scene_limit: 5 } });
  assert.equal(r.statusCode, 200, r.body);
  const out = r.json();
  assert.equal(out.shadow.status, "saved");
  const written = calls.shadow.at(-1);
  assert.equal(written.window_id, "main");
  assert.deepEqual([written.user_view, written.self_view, written.recent_events], ["她喜欢下雨天", "我学会了提醒带伞", "聊了下雨"]);
  assert.equal(written.expected_revision, 0);
  // /resume 读的是 Serein 保存的选择
  assert.equal(calls.settings.at(-1).resume.recent_scene_limit, 5);
  assert.equal(calls.settings.at(-1).resume.command_enabled, true);
  assert.equal(out.window.id, "w2");
  assert.match(out.window.sereinWindowId, /^echo-w2-/);
  assert.equal((await get("/api/chat/history")).messages.length, 0);
  const old = await get("/api/windows/w1");
  assert.equal(old.readOnly, true);
  assert.deepEqual(old.messages.map((m) => m.id), ["m1", "m2", "m3", "m4"]);
  assert.equal(old.window.shadow.title, "雨天这一窗");
  const latest = await get("/api/windows/shadow/latest");
  assert.equal(latest.shadow.sections.user_view, "她喜欢下雨天");
});

test("first message of the new window carries /resume; later turns keep it as the anchor", async () => {
  const list = await get("/api/windows");
  const sid = list.windows[0].sereinWindowId;
  await (await post("/api/chat", { streamFormat: "ndjson", messages: [{ role: "user", text: "我回来啦" }], ids: { user: "n1", echo: "n2" }, genId: "gen-w2-a" })).body;
  let sent = calls.chat.at(-1);
  assert.equal(sent.window, sid);
  assert.equal(sent.messages[1].content, "/resume 我回来啦");
  await post("/api/chat", { streamFormat: "ndjson", messages: [{ role: "user", text: "我回来啦" }, { role: "echo", text: "接上啦" }, { role: "user", text: "还记得吗" }], ids: { user: "n3", echo: "n4" }, genId: "gen-w2-b" });
  sent = calls.chat.at(-1);
  assert.equal(sent.messages[1].content, "/resume 我回来啦");
  assert.equal(sent.messages.at(-1).content, "还记得吗");
  assert.equal(sent.messages.filter((m) => m.content.includes("我回来啦")).length, 1);
  const w = (await get("/api/windows")).windows[0];
  assert.equal(w.resume.pending, false);
});

test("Codex mode: new thread preloaded via inject_items before switching; failure keeps the old window", async () => {
  const { switchWindow } = await import("../src/windows.js");
  const cfg = { apiMode: "codex", codex: { model: "gpt-x" } };
  const packet = { collectionId: "c9", items: [
    { id: "shadow:echo-w2", kind: "shadow", section: "latest_shadow", title: "t", revision: 2, body_md: "窗影正文" },
    { id: "raw:7", kind: "raw", role: "user", section: "recent_original", source_message_id: "u7", session_id: "s", body_md: "原话" },
  ] };
  await assert.rejects(switchWindow({ skipShadow: true }, { cfg, readResume: async () => packet, codexStart: async () => { throw new Error("inject failed"); } }), (e) => e.stage === "continuity");
  assert.equal((await get("/api/windows")).activeId, "w2");
  let injected;
  const r = await switchWindow({ skipShadow: true }, { cfg, readResume: async () => packet, codexStart: async (_c, items) => { injected = items; return { threadId: "thread-new" }; } });
  assert.equal(r.continuity.status, "injected");
  assert.equal(r.window.codexThreadId, "thread-new");
  assert.equal(injected[0].role, "developer");
  assert.match(injected[1].content[0].text, /shadow:echo-w2/);
  assert.equal(injected[2].role, "user");
  assert.match(injected[2].content[0].text, /"id":"raw:7".*"source_message_id":"u7"/);
});

test("busy: cannot switch while a reply is still being written", async () => {
  const { generations } = await import("../src/generations.js");
  const g = generations().start({ genId: "gen-busy-z", messageId: "z", via: "api", timeouts: { firstToken: 60, stall: 60, total: 600 } });
  const r = await post("/api/windows/switch", { skipShadow: true });
  g.finish("done");
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().stage, "busy");
});

test("unknown windows 404", async () => {
  assert.equal((await app.inject({ method: "GET", url: "/api/windows/w99" })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/api/windows/..%2Fx" })).statusCode, 404);
});
