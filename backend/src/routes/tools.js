// 工具调用接口（P0 仅预留）：统一 MCP 插头后续在此接入，先返回占位，不改动前端结构
export default async function toolsRoute(app) {
  // 工具清单（预留，后续从 MCP 工具架读取）
  app.get("/api/tools", async () => ({ tools: [], ready: false, note: "MCP 工具架在 P1 接入" }));

  // 工具调用（预留占位）
  app.post("/api/tools/:name", async (req, reply) => {
    reply.code(501);
    return { error: "not_implemented", message: `工具「${req.params.name}」将在 P1 通过 MCP 接入` };
  });
}
