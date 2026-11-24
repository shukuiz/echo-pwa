// 聊天多选删除 / 重新生成本轮 / 收藏本 / 记忆字段 / 美化云端备份：都要登录，数据落盘不丢
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Fastify from "fastify";
import { installAuth } from "../src/auth.js";

const origin = "https://echo.example";
const password = "local-test-password-only";
let app, upstream, directory, storage, headers, upstreamCalls;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "echo-actions-"));
  process.env.ECHO_DATA_DIR = directory;
  storage = await import("../src/storage.js");
  await storage.ensureDataTree(directory);
  const { default: chatRoute } = await import("../src/routes/chat.js");
  const { default: memoryRoute } = await import("../src/routes/memory.js");
  const { default: favoritesRoute } = await import("../src/routes/favorites.js");
  const { default: beautyRoute } = await import("../src/routes/beauty.js");

  upstreamCalls = [];
  upstream = Fastify();
  upstream.post("/v1/chat/completions", async (req, reply) => {
    upstreamCalls.push(req.body);
    reply.header("content-type", "text/event-stream");
    const n = upstreamCalls.length;
    return `data: ${JSON.stringify({ choices: [{ delta: { content: `第${n}次回复` } }] })}\n\ndata: [DONE]\n\n`;
  });
  const base = await upstream.listen({ host: "127.0.0.1", port: 0 });
  await storage.writeJSON(storage.paths.config(directory), {
    apiMode: "custom", provider: "openai", officialKeys: {},
    presets: [{ id: "p", name: "mock", url: base + "/v1", apiKey: "k" }], activePresetId: "p", model: "mock-model",
  });

  app = Fastify();
  installAuth(app, { ECHO_AUTH_ORIGIN: origin, ECHO_AUTH_PASSWORD: password });
  for (const r of [chatRoute, memoryRoute, favoritesRoute, beautyRoute]) await app.register(r);
  const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin }, payload: { password } });
  assert.equal(login.statusCode, 200);
  headers = { origin, cookie: login.headers["set-cookie"].split(";")[0] };
});

after(async () => {
  await app?.close();
  await upstream?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const history = async () => (await app.inject({ method: "GET", url: "/api/chat/history", headers })).json().messages;
const chat = (payload) => app.inject({ method: "POST", url: "/api/chat", headers, payload: { streamFormat: "ndjson", ...payload } });

test("chat keeps client message ids so later deletes match", async () => {
  const res = await chat({ messages: [{ role: "user", text: "你好" }], ids: { user: "u1", echo: "e1" } });
  assert.equal(res.statusCode, 200, res.body);
  const msgs = await history();
  assert.deepEqual(msgs.map((m) => [m.id, m.role, m.text]), [["u1", "user", "你好"], ["e1", "echo", "第1次回复"]]);
});

test("regenerate does not duplicate the user turn and stores the new reply", async () => {
  const del = await app.inject({ method: "DELETE", url: "/api/chat/messages", headers, payload: { ids: ["e1"] } });
  assert.equal(del.statusCode, 200);
  assert.equal(del.json().deleted, 1);
  const res = await chat({ messages: [{ role: "user", text: "你好" }], ids: { user: "u1", echo: "e2" }, regenerate: true });
  assert.equal(res.statusCode, 200, res.body);
  const msgs = await history();
  assert.deepEqual(msgs.map((m) => [m.id, m.text]), [["u1", "你好"], ["e2", "第2次回复"]]);
  // 重试同一轮（没有 regenerate 标记，但 user id 已存在）也不重复存用户消息
  await chat({ messages: [{ role: "user", text: "你好" }], ids: { user: "u1", echo: "e3" } });
  assert.equal((await history()).filter((m) => m.role === "user").length, 1);
});

test("bulk delete validates input, needs login and persists", async () => {
  assert.equal((await app.inject({ method: "DELETE", url: "/api/chat/messages", headers: { origin }, payload: { ids: ["u1"] } })).statusCode, 401);
  assert.equal((await app.inject({ method: "DELETE", url: "/api/chat/messages", headers, payload: { ids: [] } })).statusCode, 400);
  assert.equal((await app.inject({ method: "DELETE", url: "/api/chat/messages", headers, payload: { ids: "u1" } })).statusCode, 400);
  const res = await app.inject({ method: "DELETE", url: "/api/chat/messages", headers, payload: { ids: ["u1", "e2", "nope"] } });
  assert.equal(res.json().deleted, 2);
  assert.deepEqual((await history()).map((m) => m.id), ["e3"]);
  const disk = await storage.readJSON(storage.paths.chat(directory), null);
  assert.deepEqual(disk.messages.map((m) => m.id), ["e3"]);
});

test("favorites: create, list, rename, delete, auth required", async () => {
  const url = "/api/favorites";
  assert.equal((await app.inject({ method: "GET", url, headers: { origin } })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url, headers, payload: { messages: [] } })).statusCode, 400);
  const made = await app.inject({ method: "POST", url, headers, payload: {
    messages: [{ id: "a", role: "user", text: "今天的雨好大", at: 1 }, { id: "b", role: "echo", text: "记得带伞 ☂", at: 2 }, { role: "x", text: "  " }],
  } });
  assert.equal(made.statusCode, 200, made.body);
  const fav = made.json();
  assert.equal(fav.title, "今天的雨好大");
  assert.equal(fav.messages.length, 2);
  assert.equal(fav.source, "chat");
  const renamed = await app.inject({ method: "PUT", url: `${url}/${fav.id}`, headers, payload: { title: "雨天" } });
  assert.equal(renamed.json().title, "雨天");
  const list = (await app.inject({ method: "GET", url, headers })).json().favorites;
  assert.deepEqual(list.map((f) => f.title), ["雨天"]);
  assert.equal((await app.inject({ method: "DELETE", url: `${url}/${fav.id}`, headers })).statusCode, 200);
  assert.equal((await app.inject({ method: "DELETE", url: `${url}/${fav.id}`, headers })).statusCode, 404);
});

test("memory entries keep Serein-style fields and archived ones leave the prompt", async () => {
  const made = await app.inject({ method: "POST", url: "/api/memory", headers, payload: {
    kind: "preference", title: "香菜", text: "不吃香菜", cues: ["香菜", "口味", "香菜"], importance: 4,
    preference: { subject: "user", polarity: "dislike", keywords: ["香菜"], reason: "说过好几次" },
    source: { type: "chat", messageIds: ["u9"] }, bogus: "x",
  } });
  assert.equal(made.statusCode, 200, made.body);
  const m = made.json();
  assert.equal(m.tab, "text");
  assert.equal(m.kind, "preference");
  assert.deepEqual(m.cues, ["香菜", "口味"]);
  assert.equal(m.importance, 4);
  assert.equal(m.preference.polarity, "dislike");
  assert.equal(m.status, "active");
  assert.ok(m.createdAt);
  assert.equal(m.bogus, undefined);
  const { buildSystemPrompt } = await import("../src/prompt.js");
  assert.match(await buildSystemPrompt(), /不吃香菜/);
  const archived = await app.inject({ method: "PUT", url: `/api/memory/${m.id}`, headers, payload: { status: "archived", importance: 9 } });
  assert.equal(archived.json().status, "archived");
  assert.equal(archived.json().importance, 4);
  assert.doesNotMatch(await buildSystemPrompt(), /不吃香菜/);
  const ev = await app.inject({ method: "PUT", url: `/api/memory/${m.id}`, headers, payload: { kind: "event" } });
  assert.equal(ev.json().tab, "summary");
});

test("beauty backup stores newer settings only", async () => {
  const url = "/api/beauty";
  assert.equal((await app.inject({ method: "GET", url, headers: { origin } })).statusCode, 401);
  assert.deepEqual((await app.inject({ method: "GET", url, headers })).json(), { beauty: null, savedAt: 0 });
  assert.equal((await app.inject({ method: "PUT", url, headers, payload: { beauty: { tint: "#bfe2ff" }, savedAt: 200 } })).statusCode, 200);
  const stale = await app.inject({ method: "PUT", url, headers, payload: { beauty: { tint: "#000000" }, savedAt: 100 } });
  assert.equal(stale.statusCode, 409);
  assert.deepEqual((await app.inject({ method: "GET", url, headers })).json(), { beauty: { tint: "#bfe2ff" }, savedAt: 200 });
  assert.equal((await app.inject({ method: "PUT", url, headers, payload: { beauty: [], savedAt: 300 } })).statusCode, 400);
});
