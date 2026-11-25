// 更新点1：回复不被打断 —— 离开页面不取消、按 genId 接上、停止按钮、超时保留文字、报错说人话
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Fastify from "fastify";

let app, upstream, directory, storage, base, appUrl;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "echo-recovery-"));
  process.env.ECHO_DATA_DIR = directory;
  process.env.ECHO_TIMEOUT_UNIT_MS = "50"; // 测试里「一秒」= 50ms
  storage = await import("../src/storage.js");
  await storage.ensureDataTree(directory);
  const { default: chatRoute } = await import("../src/routes/chat.js");

  upstream = Fastify();
  upstream.post("/v1/chat/completions", async (req, reply) => {
    const model = req.body.model;
    if (model === "quota") return reply.code(429).send({ error: { message: "You exceeded your current quota" } });
    if (model === "badparam") return reply.code(400).send({ error: { message: "Unknown parameter: foo" } });
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (t) => reply.raw.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
    if (model === "silent") return; // 一直不出字 → 首字超时
    if (model === "stall") { chunk("写了一半"); return; } // 写一半卡住
    // slow：慢慢写 6 段
    for (let i = 1; i <= 6; i++) {
      if (reply.raw.destroyed) return;
      chunk(`第${i}段`);
      await sleep(60);
    }
    reply.raw.end("data: [DONE]\n\n");
  });
  base = await upstream.listen({ host: "127.0.0.1", port: 0 });
  await storage.writeJSON(storage.paths.config(directory), {
    apiMode: "custom", provider: "openai", officialKeys: {},
    presets: [{ id: "p", name: "mock", url: base + "/v1", apiKey: "k" }], activePresetId: "p", model: "slow",
    timeouts: { firstToken: 10, codexFirstToken: 10, stall: 10, total: 60 },
  });
  app = Fastify();
  await app.register(chatRoute);
  appUrl = await app.listen({ host: "127.0.0.1", port: 0 });
});

after(async () => {
  await app?.close();
  await upstream?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const history = async () => (await app.inject({ method: "GET", url: "/api/chat/history" })).json().messages;
const post = (payload, signal) => fetch(appUrl + "/api/chat", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ streamFormat: "ndjson", ...payload }), signal });

test("leaving the page does not cancel: the reply finishes, is saved with its genId and can be picked up", async () => {
  const ac = new AbortController();
  const res = await post({ messages: [{ role: "user", text: "慢慢说" }], ids: { user: "u1", echo: "e1" }, genId: "gen-leave-1" }, ac.signal);
  assert.equal(res.headers.get("x-echo-gen-id"), "gen-leave-1");
  const reader = res.body.getReader();
  await reader.read(); // 收到第一段
  ac.abort(); // 前端离开聊天页 / 切后台
  const mid = (await app.inject({ method: "GET", url: "/api/chat/generations/gen-leave-1" })).json();
  assert.equal(mid.status, "streaming");
  assert.ok(mid.text.startsWith("第1段"));
  const active = (await app.inject({ method: "GET", url: "/api/chat/active" })).json().generations;
  assert.ok(active.some((g) => g.genId === "gen-leave-1" && g.messageId === "e1"));
  await sleep(600);
  const done = (await app.inject({ method: "GET", url: "/api/chat/generations/gen-leave-1" })).json();
  assert.equal(done.status, "done");
  assert.equal(done.text, "第1段第2段第3段第4段第5段第6段");
  const saved = (await history()).find((m) => m.id === "e1");
  assert.equal(saved.text, done.text);
  assert.equal(saved.genId, "gen-leave-1");
  assert.equal(saved.model, "slow");
  assert.equal(saved.via, "api");
});

test("model chosen at send time: switching mid-reply finishes on the old model", async () => {
  const res = await post({ messages: [{ role: "user", text: "用旧模型" }], ids: { user: "u2", echo: "e2" }, genId: "gen-model-2", model: "slow" });
  // 生成中把默认模型换掉
  const cfg = await storage.readJSON(storage.paths.config(directory), {});
  await storage.writeJSON(storage.paths.config(directory), { ...cfg, model: "quota" });
  await res.text();
  const saved = (await history()).find((m) => m.id === "e2");
  assert.equal(saved.model, "slow");
  assert.equal(saved.status, "done");
  await storage.writeJSON(storage.paths.config(directory), cfg);
});

test("stop button cancels upstream and keeps what was written", async () => {
  const res = await post({ messages: [{ role: "user", text: "停" }], ids: { user: "u3", echo: "e3" }, genId: "gen-stop-3" });
  const reader = res.body.getReader();
  await reader.read();
  const stop = await app.inject({ method: "POST", url: "/api/chat/stop", payload: { genId: "gen-stop-3" } });
  assert.equal(stop.json().stopped, true);
  while (!(await reader.read()).done);
  const saved = (await history()).find((m) => m.id === "e3");
  assert.equal(saved.status, "stopped");
  assert.ok(saved.text.length > 0 && saved.text.length < 18);
});

test("first-token timeout ends the wait with a plain message and retry action", async () => {
  const res = await post({ messages: [{ role: "user", text: "你在吗" }], ids: { echo: "e4" }, genId: "gen-silent-4", model: "silent" });
  assert.equal(res.status, 504);
  const body = await res.json();
  assert.equal(body.kind, "timeout");
  assert.match(body.message, /还没收到第一个字/);
  assert.deepEqual(body.actions, ["retry", "settings"]);
});

test("mid-stream stall keeps the partial text and reports why", async () => {
  const res = await post({ messages: [{ role: "user", text: "卡住" }], ids: { echo: "e5" }, genId: "gen-stall-5", model: "stall" });
  const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[0].text, "写了一半");
  const last = lines.at(-1);
  assert.equal(last.type, "error");
  assert.equal(last.kind, "timeout");
  assert.match(last.text, /卡住/);
  const saved = (await history()).find((m) => m.id === "e5");
  assert.equal(saved.text, "写了一半");
  assert.equal(saved.status, "error");
  assert.equal(saved.errorKind, "timeout");
});

test("errors are classified into plain Chinese with actions", async () => {
  const quota = await (await post({ messages: [{ role: "user", text: "x" }], genId: "gen-quota-6", model: "quota" })).json();
  assert.equal(quota.kind, "quota");
  assert.ok(quota.actions.includes("settings"));
  const bad = await (await post({ messages: [{ role: "user", text: "x" }], genId: "gen-param-7", model: "badparam" })).json();
  assert.equal(bad.kind, "param");
  const { classifyReplyError } = await import("../src/reply-errors.js");
  assert.equal(classifyReplyError({ message: "fetch failed" }).kind, "network");
  assert.equal(classifyReplyError({ status: 401, via: "codex" }).actions[0], "relogin");
  assert.match(classifyReplyError({ status: 401, via: "codex" }).message, /重新登录/);
});

test("the same genId is never saved twice (a late old request cannot overwrite the retry)", async () => {
  const { generations } = await import("../src/generations.js");
  const a = generations().start({ genId: "gen-dup-8", messageId: "e8", via: "api", timeouts: { firstToken: 10, stall: 10, total: 60 } });
  assert.throws(() => generations().start({ genId: "gen-dup-8", messageId: "e8", via: "api" }), /已经在生成/);
  a.finish("done");
});

test("timeouts are configurable and validated", async () => {
  const { normTimeouts } = await import("../src/timeouts.js");
  assert.deepEqual(normTimeouts({ firstToken: 45 }), { firstToken: 45, codexFirstToken: 90, stall: 60, total: 600 });
  assert.throws(() => normTimeouts({ stall: 3 }), /10–600/);
  assert.equal(normTimeouts({ total: 5 }, undefined, { lenient: true }).total, 60);
});
