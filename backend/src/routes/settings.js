// 设置接口：Key / 接口地址只经后端读写（GET 返回脱敏，PUT 保存，预设增删改，POST /test 真实连通测试）
import {
  getConfig,
  getRawConfig,
  applySettingsPatch,
  createPreset,
  updatePreset,
  deletePreset,
  publicConfig,
  authHeaders,
} from "../config.js";
import { isMemoryModelKind, listMemoryModels, publicMemoryModels, readMemoryModels, saveMemoryModel } from "../memory-model-config.js";
import { testMemoryModel } from "../memory-recall.js";

const normBase = (u) => String(u || "").replace(/\/+$/, "");

/** 统一把参数错误转成 400 + message */
async function guarded(reply, fn) {
  try {
    return publicConfig(await fn());
  } catch (e) {
    reply.code(400);
    return { error: "bad_request", message: e.message || "参数不合法" };
  }
}

export default async function settingsRoute(app) {
  const memoryModelsPath = "/api/settings/memory-models";
  app.get(memoryModelsPath, async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return publicMemoryModels(await readMemoryModels());
  });
  app.put(memoryModelsPath + "/:kind", { bodyLimit: 8192 }, async (req, reply) => {
    const { kind } = req.params;
    if (!isMemoryModelKind(kind)) return reply.code(404).send({ message: "未知的记忆模型类型" });
    try {
      return await saveMemoryModel(kind, req.body);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return reply.code(400).send({ error: "bad_request", message: error.message });
    }
  });
  app.post(memoryModelsPath + "/:kind/models", { bodyLimit: 8192 }, async (req, reply) => {
    const { kind } = req.params;
    if (!isMemoryModelKind(kind)) return reply.code(404).send({ message: "未知的记忆模型类型" });
    reply.header("Cache-Control", "no-store");
    try {
      return { models: await listMemoryModels(kind, req.body) };
    } catch (error) {
      if (error instanceof RangeError) return reply.code(400).send({ message: error.message });
      const message = error.message.startsWith("模型列表接口返回") ? error.message : "无法读取模型列表，可手动填写模型名";
      return reply.code(502).send({ message });
    }
  });
  app.post(memoryModelsPath + "/:kind/test", { bodyLimit: 1024 }, async (req, reply) => {
    const { kind } = req.params;
    if (!isMemoryModelKind(kind)) return reply.code(404).send({ message: "未知的记忆模型类型" });
    return testMemoryModel(kind, (await readMemoryModels())[kind]);
  });

  // 读设置（Key 脱敏）
  app.get("/api/settings", async () => publicConfig(await getRawConfig()));

  // 保存设置。apiKey 写入当前生效的官方厂商或当前预设；空字符串表示清除，不传则不改
  app.put("/api/settings", async (req, reply) => guarded(reply, () => applySettingsPatch(req.body || {})));

  // 自定义预设：新建（自动设为当前）/ 修改 / 删除
  app.post("/api/presets", async (req, reply) => guarded(reply, () => createPreset(req.body || {})));
  app.put("/api/presets/:id", async (req, reply) => guarded(reply, () => updatePreset(req.params.id, req.body || {})));
  app.delete("/api/presets/:id", async (req, reply) => guarded(reply, () => deletePreset(req.params.id)));

  // 拉取模型列表：走后端请求 {base}/models，支持 ?q= 前端/接口搜索过滤
  app.get("/api/models", async (req) => {
    const cfg = await getConfig();
    if (!cfg.apiKey) return { error: "no_key", message: "还没填 API Key", models: [] };
    const base = normBase(cfg.proxyUrl);
    if (!/^https?:\/\//i.test(base)) return { error: "bad_base", message: "还没选择接口，或接口地址不是 http(s):// 开头", models: [] };
    try {
      const res = await fetch(`${base}/models`, {
        headers: authHeaders(cfg),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return { error: "upstream", message: `接口返回 ${res.status}`, models: [] };
      const data = await res.json();
      let list = [];
      if (Array.isArray(data?.data)) list = data.data.map((m) => m?.id).filter(Boolean);
      else if (Array.isArray(data?.models)) list = data.models.map((m) => (typeof m === "string" ? m : m?.id)).filter(Boolean);
      else if (Array.isArray(data)) list = data.map((m) => (typeof m === "string" ? m : m?.id)).filter(Boolean);
      const q = String(req.query?.q || "").trim().toLowerCase();
      if (q) list = list.filter((id) => id.toLowerCase().includes(q));
      return { models: list };
    } catch (e) {
      return { error: "connect_failed", message: "连不上接口：" + e.message, models: [] };
    }
  });

  // 测试连接：真实请求模型接口 /models
  app.post("/api/settings/test", async () => {
    const cfg = await getConfig();
    if (!cfg.apiKey) return { ok: false, message: "还没填 API Key" };
    const base = normBase(cfg.proxyUrl);
    if (!/^https?:\/\//i.test(base)) return { ok: false, message: "还没选择接口，或接口地址不是 http(s):// 开头" };
    const started = Date.now();
    try {
      const res = await fetch(`${base}/models`, {
        headers: authHeaders(cfg),
        signal: AbortSignal.timeout(8000),
      });
      const ms = Date.now() - started;
      if (res.ok) return { ok: true, message: `连接成功 · ${ms}ms` };
      return { ok: false, message: `接口返回 ${res.status}` };
    } catch (e) {
      return { ok: false, message: "连不上接口：" + e.message };
    }
  });
}
