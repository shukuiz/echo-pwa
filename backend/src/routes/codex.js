// Codex（ChatGPT 订阅）连接的状态 / 模型 / 新对话 / 登录，以及「说明书」（data/AGENTS.md）的读写
import { codexBridge, gentleCodexError } from "../codex.js";
import { DEFAULT_AGENTS, paths, readText, writeText, DATA_DIR } from "../storage.js";

const MAX_AGENTS = 64 * 1024;

export default async function codexRoute(app) {
  const guard = (fn) => async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await fn(req, reply);
    } catch (e) {
      reply.code(e.code === "busy" ? 409 : 502);
      return { error: "codex", message: gentleCodexError(e.message) };
    }
  };

  app.get("/api/codex/status", guard(async () => codexBridge().status()));
  app.get("/api/codex/models", guard(async () => ({ models: await codexBridge().models() })));
  app.post("/api/codex/thread/reset", guard(async () => codexBridge().resetThread()));
  app.post("/api/codex/login", guard(async () => {
    const bridge = codexBridge();
    const account = await bridge.readAccount();
    if (account) return { loggedIn: true, account };
    return { loggedIn: false, ...(await bridge.startLogin()) };
  }));
  app.post("/api/codex/login/cancel", guard(async () => codexBridge().cancelLogin()));

  // 说明书：echo 的人设文件。普通接口每条消息都会重新读；Codex 只在开新对话时读一次
  app.get("/api/manual", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    const content = await readText(paths.agents(DATA_DIR), DEFAULT_AGENTS);
    return { content, defaultContent: DEFAULT_AGENTS, size: Buffer.byteLength(content) };
  });
  app.put("/api/manual", { bodyLimit: MAX_AGENTS + 4096 }, async (req, reply) => {
    const content = req.body?.content;
    if (typeof content !== "string" || !content.trim()) return reply.code(400).send({ error: "bad_input", message: "说明书不能是空的" });
    if (Buffer.byteLength(content) > MAX_AGENTS) return reply.code(400).send({ error: "bad_input", message: "说明书太长啦，最多 64 KB" });
    await writeText(paths.agents(DATA_DIR), content);
    await writeText(paths.claude(DATA_DIR), content); // CLAUDE.md 与 AGENTS.md 保持同步
    return { ok: true, content, savedAt: Date.now() };
  });
  app.post("/api/manual/reset", async () => {
    await writeText(paths.agents(DATA_DIR), DEFAULT_AGENTS);
    await writeText(paths.claude(DATA_DIR), DEFAULT_AGENTS);
    return { ok: true, content: DEFAULT_AGENTS, savedAt: Date.now() };
  });
}
