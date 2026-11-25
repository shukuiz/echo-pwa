// Codex（ChatGPT 订阅）连接：用假的 app-server 跑通 状态 / 模型 / 聊天流 / 新对话 / 停止 / 重新生成 / 说明书
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import Fastify from "fastify";
import { installAuth } from "../src/auth.js";

const fixture = fileURLToPath(new URL("./fixtures/mock-codex.mjs", import.meta.url));
const origin = "https://echo.example";
const password = "local-test-password-only";
let app, directory, storage, codex, headers, logFile, baseUrl;

const makeBridge = () => new codex.CodexBridge({
  dataDir: directory, command: process.execPath, args: [fixture],
  env: { ...process.env, MOCK_CODEX_LOG: logFile, ECHO_CODEX_SEREIN_TOKEN_FILE: path.join(directory, "token"), ECHO_AUTH_PASSWORD: "secret-should-not-leak" },
});

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "echo-codex-"));
  logFile = path.join(directory, "calls.log");
  await writeFile(path.join(directory, "token"), "serein-token\n");
  process.env.ECHO_DATA_DIR = directory;
  storage = await import("../src/storage.js");
  await storage.ensureDataTree(directory);
  codex = await import("../src/codex.js");
  codex.setCodexBridgeForTests(makeBridge());
  const { default: chatRoute } = await import("../src/routes/chat.js");
  const { default: settingsRoute } = await import("../src/routes/settings.js");
  const { default: codexRoute } = await import("../src/routes/codex.js");
  app = Fastify();
  installAuth(app, { ECHO_AUTH_ORIGIN: origin, ECHO_AUTH_PASSWORD: password, ECHO_DATA_DIR: directory });
  for (const r of [chatRoute, settingsRoute, codexRoute]) await app.register(r);
  baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin }, payload: { password } });
  headers = { origin, cookie: login.headers["set-cookie"].split(";")[0] };
});

after(async () => {
  (await import("../src/codex.js")).codexBridge().stop();
  await app?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const calls = async () => (await readFile(logFile, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const lines = (body) => body.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const history = async () => (await app.inject({ method: "GET", url: "/api/chat/history", headers })).json().messages;
const chat = (payload) => app.inject({ method: "POST", url: "/api/chat", headers, payload: { streamFormat: "ndjson", ...payload } });

test("switching to Codex keeps the other connections and exposes the Codex model", async () => {
  const res = await app.inject({ method: "PUT", url: "/api/settings", headers, payload: { apiMode: "codex", codex: { model: "gpt-mock", effort: "high" } } });
  assert.equal(res.statusCode, 200, res.body);
  const cfg = res.json();
  assert.equal(cfg.apiMode, "codex");
  assert.deepEqual(cfg.codex, { model: "gpt-mock", effort: "high", showThinking: true });
  assert.equal(cfg.model, "gpt-mock");
  assert.equal(cfg.hasKey, true);
  const bad = await app.inject({ method: "PUT", url: "/api/settings", headers, payload: { codex: { effort: "turbo" } } });
  assert.equal(bad.statusCode, 400);
});

test("status and model list come from the app-server", async () => {
  const status = (await app.inject({ method: "GET", url: "/api/codex/status", headers })).json();
  assert.equal(status.alive, true);
  assert.equal(status.loggedIn, true);
  assert.equal(status.account.email, "me@example.com");
  const { models } = (await app.inject({ method: "GET", url: "/api/codex/models", headers })).json();
  assert.deepEqual(models.map((m) => m.id), ["gpt-mock"]);
  assert.deepEqual(models[0].efforts, ["low", "high"]);
});

test("a chat turn sends only the new message and streams reply + thinking", async () => {
  const res = await chat({ messages: [{ role: "user", text: "旧的话" }, { role: "echo", text: "旧回复" }, { role: "user", text: "你好" }], ids: { user: "u1", echo: "e1" } });
  assert.equal(res.statusCode, 200, res.body);
  const events = lines(res.body);
  const content = events.filter((e) => e.type === "content").map((e) => e.text).join("");
  const reasoning = events.filter((e) => e.type === "reasoning").map((e) => e.text).join("");
  assert.equal(content, "回复1：你好");
  assert.match(reasoning, /我去翻翻记忆/);
  assert.match(reasoning, /Thinking about it/);
  assert.match(reasoning, /翻了翻记忆 · recall_memory/);
  assert.doesNotMatch(res.body, /不该出现/);

  const log = await calls();
  const start = log.find((c) => c.method === "thread/start");
  assert.equal(start.params.sandbox, "read-only");
  assert.equal(start.params.approvalPolicy, "never");
  assert.equal(start.params.cwd, directory);
  assert.equal(start.cwd, directory);
  assert.equal(start.hasToken, true);
  assert.equal(start.leaked, false);
  const turn = log.find((c) => c.method === "turn/start");
  assert.deepEqual(turn.params.input, [{ type: "text", text: "你好", text_elements: [] }]);
  assert.equal(turn.params.effort, "high");
  assert.equal(turn.params.model, "gpt-mock");
  assert.equal(turn.params.summary, "auto");

  const msgs = await history();
  assert.deepEqual(msgs.map((m) => [m.id, m.role, m.text, m.status]), [["u1", "user", "你好", undefined], ["e1", "echo", "回复1：你好", "done"]]);
  assert.equal(msgs[1].via, "codex");
});

test("later turns reuse the same thread; regenerate reverts the last turn first", async () => {
  await chat({ messages: [{ role: "user", text: "第二句" }], ids: { user: "u2", echo: "e2" } });
  const regen = await chat({ messages: [{ role: "user", text: "第二句" }], ids: { echo: "e3" }, regenerate: true });
  assert.equal(regen.statusCode, 200);
  const log = await calls();
  assert.equal(log.filter((c) => c.method === "thread/start").length, 1);
  const revert = log.find((c) => c.method === "thread/revert");
  assert.equal(revert.params.threadId, "thread-1");
  assert.equal(revert.params.beforeTurnId, "turn-2");
  assert.equal((await history()).filter((m) => m.role === "user" && m.text === "第二句").length, 1);
});

test("command approvals are declined, failures are explained in Chinese", async () => {
  const ok = await chat({ messages: [{ role: "user", text: "cmd 看看" }] });
  assert.equal(ok.statusCode, 200);
  let answer;
  for (let i = 0; i < 50 && !answer; i++) {
    answer = (await calls()).find((c) => c.method === undefined && c.id === 9001);
    if (!answer) await new Promise((r) => setTimeout(r, 20));
  }
  assert.deepEqual(answer.result, { decision: "decline" });
  const failed = await chat({ messages: [{ role: "user", text: "fail" }] });
  assert.equal(failed.statusCode, 502);
  assert.match(failed.json().message, /额度/);
});

test("stopping the request interrupts the Codex turn and keeps the partial reply", async () => {
  const ac = new AbortController();
  const res = await fetch(baseUrl + "/api/chat", {
    method: "POST", headers: { ...headers, "content-type": "application/json" }, signal: ac.signal,
    body: JSON.stringify({ streamFormat: "ndjson", messages: [{ role: "user", text: "slow please" }], ids: { user: "us", echo: "es" } }),
  });
  const reader = res.body.getReader();
  await reader.read();
  ac.abort();
  for (let i = 0; i < 50 && !(await history()).some((m) => m.id === "es"); i++) await new Promise((r) => setTimeout(r, 20));
  const saved = (await history()).find((m) => m.id === "es");
  assert.equal(saved.status, "stopped");
  assert.ok((await calls()).some((c) => c.method === "turn/interrupt"));
  assert.equal(codex.codexBridge().busy, false);
});

test("新对话 starts a fresh thread; a lost thread is replaced with a gentle note", async () => {
  const reset = await app.inject({ method: "POST", url: "/api/codex/thread/reset", headers });
  assert.equal(reset.statusCode, 200);
  await chat({ messages: [{ role: "user", text: "重新开始" }] });
  assert.equal((await calls()).filter((c) => c.method === "thread/start").length, 2);

  codex.codexBridge().stop();
  await storage.writeJSON(path.join(directory, "memory", "settings", "codex-thread.json"), { threadId: "gone" });
  codex.setCodexBridgeForTests(makeBridge());
  const res = await chat({ messages: [{ role: "user", text: "还在吗" }] });
  assert.match(res.body, /接不上了/);
});

test("showThinking off hides reasoning and asks Codex for no summary", async () => {
  await app.inject({ method: "PUT", url: "/api/settings", headers, payload: { codex: { showThinking: false } } });
  const res = await chat({ messages: [{ role: "user", text: "安静点" }] });
  assert.equal(lines(res.body).filter((e) => e.type === "reasoning").length, 0);
  assert.equal((await calls()).filter((c) => c.method === "turn/start").at(-1).params.summary, "none");
});

test("device-code login is offered when Codex is signed out", async () => {
  const bridge = codex.codexBridge();
  bridge.stop();
  const out = new codex.CodexBridge({ dataDir: directory, command: process.execPath, args: [fixture], env: { ...process.env, MOCK_CODEX_LOGGED_OUT: "1" } });
  codex.setCodexBridgeForTests(out);
  const res = (await app.inject({ method: "POST", url: "/api/codex/login", headers })).json();
  assert.equal(res.loggedIn, false);
  assert.equal(res.code, "ABCD-1234");
  assert.equal(res.url, "https://auth.example/device");
  const status = (await app.inject({ method: "GET", url: "/api/codex/status", headers })).json();
  assert.equal(status.loggedIn, false);
  assert.equal(status.login.code, "ABCD-1234");
  out.stop();
  codex.setCodexBridgeForTests(makeBridge());
});

test("说明书 can be read, saved and restored, and needs login", async () => {
  assert.equal((await app.inject({ method: "GET", url: "/api/manual" })).statusCode, 401);
  const got = (await app.inject({ method: "GET", url: "/api/manual", headers })).json();
  assert.equal(got.content, storage.DEFAULT_AGENTS);
  const saved = await app.inject({ method: "PUT", url: "/api/manual", headers, payload: { content: "# 新说明书\n温柔一点" } });
  assert.equal(saved.statusCode, 200);
  assert.equal(await readFile(path.join(directory, "AGENTS.md"), "utf8"), "# 新说明书\n温柔一点");
  assert.equal(await readFile(path.join(directory, "CLAUDE.md"), "utf8"), "# 新说明书\n温柔一点");
  const status = (await app.inject({ method: "GET", url: "/api/codex/status", headers })).json();
  assert.equal(status.agentsChanged, true);
  assert.equal((await app.inject({ method: "PUT", url: "/api/manual", headers, payload: { content: "  " } })).statusCode, 400);
  const reset = (await app.inject({ method: "POST", url: "/api/manual/reset", headers })).json();
  assert.equal(reset.content, storage.DEFAULT_AGENTS);
});
