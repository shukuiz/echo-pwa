// 设置接口：Key / 代理地址只经后端读写（GET 返回脱敏，PUT 保存，POST /test 真实连通测试）
import { getConfig, saveConfig, publicConfig } from "../config.js";

const normBase = (u) => String(u || "").replace(/\/+$/, "");

export default async function settingsRoute(app) {
  // 读设置（Key 脱敏）
  app.get("/api/settings", async () => {
    const cfg = await getConfig();
    return publicConfig(cfg);
  });

  // 保存设置。apiKey 传空字符串表示清除；不传则不改动
  app.put("/api/settings", async (req) => {
    const body = req.body || {};
    const patch = {};
    if (typeof body.apiKey === "string") patch.apiKey = body.apiKey.trim();
    if (typeof body.proxyUrl === "string") patch.proxyUrl = body.proxyUrl.trim();
    if (typeof body.model === "string") patch.model = body.model;
    if (Array.isArray(body.models)) patch.models = body.models;
    if (body.codexEnabled !== undefined) patch.codexEnabled = !!body.codexEnabled;
    if (body.claudeEnabled !== undefined) patch.claudeEnabled = !!body.claudeEnabled;
    if (body.defaultHand !== undefined) patch.defaultHand = body.defaultHand;
    if (body.quietThink !== undefined) patch.quietThink = !!body.quietThink;
    if (body.tools && typeof body.tools === "object") patch.tools = body.tools;
    const next = await saveConfig(patch);
    return publicConfig(next);
  });

  // 测试连接：真实请求模型接口 /models
  app.post("/api/settings/test", async () => {
    const cfg = await getConfig();
    if (!cfg.apiKey) return { ok: false, message: "还没填 API Key" };
    const base = normBase(cfg.proxyUrl);
    if (!/^https?:\/\//i.test(base)) return { ok: false, message: "代理地址需以 http(s):// 开头" };
    const started = Date.now();
    try {
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
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
