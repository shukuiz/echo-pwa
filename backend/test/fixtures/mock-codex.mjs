// 测试用的假 codex app-server：一行一条 JSON-RPC，只实现 echo 用到的方法
import { appendFileSync } from "node:fs";
import readline from "node:readline";

const log = process.env.MOCK_CODEX_LOG;
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const note = (method, params) => send({ method, params });
let threads = 0;
let turns = 0;
let active = null;

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (log) appendFileSync(log, JSON.stringify({ method: msg.method, params: msg.params, id: msg.id, result: msg.result, cwd: process.cwd(), hasToken: !!process.env.SEREIN_MCP_TOKEN, leaked: !!process.env.ECHO_AUTH_PASSWORD }) + "\n");
  if (msg.method === undefined) return; // 对 server request 的回复
  const reply = (result) => send({ id: msg.id, result });
  const p = msg.params || {};
  switch (msg.method) {
    case "initialize": return reply({ userAgent: "mock", codexHome: "/tmp", platformFamily: "unix", platformOs: "linux" });
    case "initialized": return;
    case "account/read": return reply({ account: process.env.MOCK_CODEX_LOGGED_OUT ? null : { type: "chatgpt", email: "me@example.com", planType: "plus" } });
    case "model/list": return reply({ data: [
      { id: "gpt-mock", model: "gpt-mock", displayName: "GPT-Mock", description: "", hidden: false, isDefault: true, defaultReasoningEffort: "low",
        supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }, { reasoningEffort: "ultra" }], inputModalities: ["text", "image"] },
      { id: "hidden", model: "hidden", hidden: true, supportedReasoningEfforts: [] },
    ], nextCursor: null });
    case "thread/start": {
      const id = `thread-${++threads}`;
      reply({ thread: { id }, model: "gpt-mock" });
      note("mcpServer/startupStatus/updated", { threadId: id, name: "serein", status: "ready", error: null });
      return;
    }
    case "thread/resume":
      if (p.threadId === "gone") return send({ id: msg.id, error: { code: -32600, message: "no rollout found" } });
      return reply({ thread: { id: p.threadId } });
    case "thread/revert": return reply({});
    case "account/login/start": return reply({ type: "chatgptDeviceCode", loginId: "L1", verificationUrl: "https://auth.example/device", userCode: "ABCD-1234" });
    case "account/login/cancel": return reply({ status: "canceled" });
    case "turn/interrupt":
      reply({});
      if (active) { clearInterval(active.timer); note("turn/completed", { threadId: active.threadId, turn: { id: active.turnId, status: "interrupted", error: null } }); active = null; }
      return;
    case "turn/start": {
      const turnId = `turn-${++turns}`;
      const threadId = p.threadId;
      const text = p.input?.[0]?.text || "";
      reply({ turn: { id: turnId, status: "inProgress", items: [] } });
      const base = { threadId, turnId };
      if (text.includes("slow")) {
        note("item/started", { ...base, item: { type: "agentMessage", id: "m-slow", phase: "final_answer" } });
        active = { threadId, turnId, timer: setInterval(() => note("item/agentMessage/delta", { ...base, itemId: "m-slow", delta: "…" }), 20) };
        return;
      }
      if (text.includes("fail")) {
        note("error", { ...base, willRetry: false, error: { message: "You've hit your usage limit" } });
        note("turn/completed", { threadId, turn: { id: turnId, status: "failed", error: { message: "You've hit your usage limit" } } });
        return;
      }
      if (text.includes("cmd")) send({ id: 9001, method: "item/commandExecution/requestApproval", params: { threadId, turnId, itemId: "c1" } });
      note("item/started", { ...base, item: { type: "agentMessage", id: "m1", phase: "commentary" } });
      note("item/agentMessage/delta", { ...base, itemId: "m1", delta: "我去翻翻记忆" });
      note("item/reasoning/summaryTextDelta", { ...base, itemId: "r1", summaryIndex: 0, delta: "Thinking about it" });
      note("item/started", { ...base, item: { type: "mcpToolCall", id: "t1", server: "serein", tool: "recall_memory" } });
      note("item/started", { ...base, item: { type: "agentMessage", id: "m2", phase: "final_answer" } });
      note("item/agentMessage/delta", { ...base, itemId: "m2", delta: `回复${turns}：` });
      note("item/agentMessage/delta", { ...base, itemId: "m2", delta: text });
      note("item/agentMessage/delta", { threadId, turnId: "other-turn", itemId: "zz", delta: "不该出现" });
      note("turn/completed", { threadId, turn: { id: turnId, status: "completed", error: null } });
      return;
    }
    default:
      send({ id: msg.id, error: { code: -32601, message: "unknown " + msg.method } });
  }
});
