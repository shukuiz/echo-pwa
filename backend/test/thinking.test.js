// 思考：原生思考参数 / 400 去参数重试 / 强制 CoT（用户保存的提示词原样使用）/ <think> 拆分（跨段、未闭合）/ 思考不回传
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import Fastify from "fastify";
import { ThinkSplitter, stripThink, planThinking, normThinking, DEFAULT_COT_PROMPT } from "../src/thinking.js";

let app, upstream, directory, storage, base, calls, script;

const sse = (events) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
const delta = (d) => ({ choices: [{ delta: d }] });

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "echo-think-"));
  process.env.ECHO_DATA_DIR = directory;
  storage = await import("../src/storage.js");
  await storage.ensureDataTree(directory);
  const { default: chatRoute } = await import("../src/routes/chat.js");
  const { default: settingsRoute } = await import("../src/routes/settings.js");

  calls = [];
  upstream = Fastify();
  // 模拟网关：script(body) 返回 { status, body } 或 SSE 事件数组；chunks 用来把一条 SSE 切成好几段写出去
  upstream.post("/v1/chat/completions", async (req, reply) => {
    calls.push(req.body);
    const out = script(req.body, calls.length);
    if (out.status) return reply.code(out.status).send(out.body);
    reply.raw.writeHead(200, { "content-type": "text/event-stream" });
    for (const piece of out.raw ? out.raw : [sse(out)]) reply.raw.write(piece);
    reply.raw.end();
    return reply;
  });
  base = (await upstream.listen({ host: "127.0.0.1", port: 0 })) + "/v1";

  app = Fastify();
  await app.register(chatRoute);
  await app.register(settingsRoute);
});

after(async () => {
  await app?.close();
  await upstream?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function useThinking(thinking, model = "mock-model") {
  await storage.writeJSON(storage.paths.config(directory), {
    apiMode: "custom", provider: "openai", officialKeys: {},
    presets: [{ id: "p", name: "mock", url: base, apiKey: "k", model, ...(thinking ? { thinking } : {}) }], activePresetId: "p", model,
  });
}
beforeEach(() => { calls.length = 0; });

async function chat(text = "你好", extra = {}) {
  const res = await app.inject({ method: "POST", url: "/api/chat", payload: { streamFormat: "ndjson", messages: [{ role: "user", text }], ...extra } });
  const events = res.body.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const join = (type) => events.filter((e) => e.type === type).map((e) => e.text).join("");
  return { res, events, content: join("content"), reasoning: join("reasoning"), note: join("note") };
}

test("reasoning_content (DeepSeek reasoner) streams as reasoning, not content", async () => {
  await useThinking({ mode: "native", format: "deepseek" }, "deepseek-reasoner");
  script = () => [delta({ reasoning_content: "先想想" }), delta({ reasoning_content: "她累了" }), delta({ content: "辛苦啦" })];
  const r = await chat();
  assert.equal(r.res.statusCode, 200, r.res.body);
  assert.equal(r.reasoning, "先想想她累了");
  assert.equal(r.content, "辛苦啦");
  assert.equal("reasoning_effort" in calls[0], false, "deepseek 不需要额外参数");
});

test("Anthropic thinking_delta events become reasoning; native anthropic sends thinking budget", async () => {
  await useThinking({ mode: "native", format: "anthropic", budget: 2048 }, "claude-sonnet-4-5");
  script = () => [
    { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "嗯…" } },
    { type: "content_block_delta", delta: { type: "text_delta", text: "我在" } },
  ];
  const r = await chat();
  assert.equal(r.reasoning, "嗯…");
  assert.equal(r.content, "我在");
  assert.deepEqual(calls[0].thinking, { type: "enabled", budget_tokens: 2048 });
});

test("native OpenAI-compatible sends reasoning_effort merged with extra JSON", async () => {
  await useThinking({ mode: "native", format: "openai", effort: "high", extra: '{"top_k": 20, "reasoning_effort": "low"}' });
  script = () => [delta({ content: "好" })];
  await chat();
  assert.equal(calls[0].reasoning_effort, "low", "附加参数可以覆盖生成的参数");
  assert.equal(calls[0].top_k, 20);
  assert.equal(calls[0].model, "mock-model");
});

test("Gemini-compatible uses include_thoughts via extra_body", async () => {
  await useThinking({ mode: "native", format: "gemini", budget: 1024 }, "gemini-2.5-flash");
  script = () => [delta({ content: "好" })];
  await chat();
  assert.deepEqual(calls[0].extra_body, { google: { thinking_config: { include_thoughts: true, thinking_budget: 1024 } } });
});

test("upstream 400 on thinking params: retries once without them and sends a gentle note", async () => {
  await useThinking({ mode: "native", format: "openai", effort: "medium" });
  script = (body) => ("reasoning_effort" in body ? { status: 400, body: { error: { message: "Unrecognized request argument: reasoning_effort" } } } : [delta({ content: "没思考也回你" })]);
  const r = await chat();
  assert.equal(r.res.statusCode, 200, r.res.body);
  assert.equal(calls.length, 2);
  assert.equal("reasoning_effort" in calls[1], false);
  assert.equal(r.content, "没思考也回你");
  assert.match(r.note, /思考参数/);
  const saved = (await storage.readJSON(storage.paths.chat(directory), { messages: [] })).messages.at(-1);
  assert.match(saved.note, /思考参数/);
});

test("<think> split across chunks goes to reasoning; tags never reach content", async () => {
  await useThinking({ mode: "off" });
  const pieces = ["<th", "ink>先", "想一", "下</thi", "nk>\n\n好", "呀"];
  const events = pieces.map((p) => delta({ content: p }));
  // 把每条 SSE 再切成两半写出去，模拟网络把 data 行切开
  const raw = [];
  for (const line of sse(events).split(/(?<=\n\n)/)) raw.push(line.slice(0, 7), line.slice(7));
  script = () => ({ raw });
  const r = await chat();
  assert.equal(r.reasoning, "先想一下");
  assert.equal(r.content, "好呀");
  const saved = (await storage.readJSON(storage.paths.chat(directory), { messages: [] })).messages.at(-1);
  assert.equal(saved.text, "好呀");
  assert.equal(saved.reasoning, "先想一下");
});

test("CoT mode appends exactly the saved prompt to the system message", async () => {
  const custom = "  先在 <think></think> 里用三句话想清楚，再回复。\n别忘了颜文字 (｡･ω･｡)  ";
  await useThinking({ mode: "cot", cotPrompt: custom });
  script = () => [delta({ content: "<think>她想要短一点" }), delta({ content: "</think>知道啦 ( ˘ᵕ˘ )" })];
  const r = await chat();
  const sys = calls[0].messages[0];
  assert.equal(sys.role, "system");
  assert.ok(sys.content.endsWith("\n\n" + custom), "system 末尾就是用户保存的原文");
  assert.equal(r.reasoning, "她想要短一点");
  assert.equal(r.content, "知道啦 ( ˘ᵕ˘ )");
  assert.equal("reasoning_effort" in calls[0], false);
});

test("reasoning is never sent back: old <think> in history is stripped", async () => {
  await useThinking({ mode: "off" });
  script = () => [delta({ content: "嗯" })];
  await app.inject({ method: "POST", url: "/api/chat", payload: { streamFormat: "ndjson", messages: [
    { role: "user", text: "早" }, { role: "echo", text: "<think>秘密</think>早安", reasoning: "秘密" }, { role: "user", text: "在吗" },
  ] } });
  const sent = calls[0].messages.map((m) => m.content).join("|");
  assert.equal(sent.includes("秘密"), false);
  assert.equal(calls[0].messages[2].content, "早安");
});

test("unclosed <think> at the end stays reasoning with a note", async () => {
  await useThinking({ mode: "cot" });
  script = () => [delta({ content: "<think>想着想着" }), delta({ content: "就断了" })];
  const r = await chat();
  assert.equal(r.reasoning, "想着想着就断了");
  assert.equal(r.content, "");
  assert.match(r.note, /没写完/);
});

test("settings: thinking saved per preset, validated, previewed with the same plan", async () => {
  await useThinking(null);
  const bad = await app.inject({ method: "PUT", url: "/api/presets/p", payload: { thinking: { mode: "native", extra: "{oops" } } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().message, /JSON/);
  const empty = await app.inject({ method: "PUT", url: "/api/presets/p", payload: { thinking: { mode: "cot", cotPrompt: "   " } } });
  assert.equal(empty.statusCode, 400);
  const ok = await app.inject({ method: "PUT", url: "/api/presets/p", payload: { thinking: { mode: "native", format: "anthropic", budget: 3000, cotPrompt: "我的提示词" } } });
  assert.equal(ok.statusCode, 200, ok.body);
  const p = ok.json().presets[0];
  assert.equal(p.thinking.mode, "native");
  assert.equal(p.thinking.cotPrompt, "我的提示词");
  assert.equal(JSON.stringify(ok.json()).includes('"k"'), false, "不回传 Key");
  const pv = await app.inject({ method: "POST", url: "/api/settings/thinking-preview", payload: { thinking: p.thinking, provider: "custom", model: "x" } });
  assert.deepEqual(pv.json().extras, { thinking: { type: "enabled", budget_tokens: 3000 } });
  assert.equal(pv.json().defaults.cotPrompt, DEFAULT_COT_PROMPT);
});

test("ThinkSplitter unit cases", () => {
  const run = (pieces) => { const s = new ThinkSplitter(); let c = "", t = ""; for (const p of pieces) { const r = s.push(p); c += r.content; t += r.thought; } const f = s.flush(); return [c + f.content, t + f.thought]; };
  assert.deepEqual(run(["你好"]), ["你好", ""]);
  assert.deepEqual(run(["  ", "<think>a</think>", "b"]), ["b", "a"]);
  assert.deepEqual(run(["a<", "b"]), ["a<b", ""], "不是标签的 < 原样保留");
  assert.deepEqual(run(["想好了</think>回复"]), ["回复", "想好了"], "只有结尾标签：前面算思考");
  assert.deepEqual(run(["先说", "不过这里有 <think>字面标签", "和后半句"]), ["先说不过这里有 <think>字面标签和后半句", ""], "正文开始后开头标签按普通文本保留");
  assert.deepEqual(run(["先说", "这里有 </think>字面标签"]), ["先说这里有 </think>字面标签", ""], "正文开始后结束标签按普通文本保留");
  assert.deepEqual(run(["先说 <", "thi", "nk>字面", "和 </", "thi", "nk>"]), ["先说 <think>字面和 </think>", ""], "正文开始后跨块标签按普通文本保留");
  assert.deepEqual(run(["<thi", "nk>想", "想</thi", "nk>正文"]), ["正文", "想想"], "开头思考标签跨块仍正常拆分");
  assert.equal(stripThink("<think>x</think>\n正文"), "正文");
  assert.equal(planThinking(normThinking({ mode: "off" }), { provider: "openai" }).systemAppend, "");
});
