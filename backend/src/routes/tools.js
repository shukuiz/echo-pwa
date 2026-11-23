// 工具调用接口：MCP 工具默认走 API；打开动手入口（Codex/Claude）后由后端统一调度执行。
// 当前先保留接口结构与路由判定，具体工具实现随「后期放功能」接入。
import { getConfig } from "../config.js";

const TOOL_IDS = ["translate", "media", "worldbook", "miniapp", "script"];

export default async function toolsRoute(app) {
  // 工具清单 + 当前路由（后端 / API）
  app.get("/api/tools", async () => {
    const cfg = await getConfig();
    const handEnabled = cfg.codexEnabled || cfg.claudeEnabled;
    const routing = handEnabled ? "backend" : "api";
    return {
      tools: TOOL_IDS.map((id) => ({ id, enabled: cfg.tools[id] !== false, routing })),
      handEnabled,
      note: handEnabled ? "动手入口已开，工具交给后端执行" : "动手入口未开，工具走 API",
    };
  });

  // 工具调用（接口预留；默认走 API，后端执行在后续版本接入）
  app.post("/api/tools/:name", async (req, reply) => {
    const cfg = await getConfig();
    const handEnabled = cfg.codexEnabled || cfg.claudeEnabled;
    reply.code(501);
    return {
      error: "not_implemented",
      routing: handEnabled ? "backend" : "api",
      message: `工具「${req.params.name}」将在后续版本接入${handEnabled ? "后端执行" : "（走 API）"}`,
    };
  });
}
