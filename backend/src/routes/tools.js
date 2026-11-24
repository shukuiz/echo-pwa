// MCP 服务：先列出计划接入的服务（高德地图、麦当劳等），具体调用后期接入
// 旧的「翻译 / 找图 / 世界书 / 小应用 / 脚本」开关只是模型本身就能做的事，已移除

/** 计划接入的 MCP 服务；status: planned 表示还没接 */
export const MCP_SERVERS = [
  { id: "amap", name: "高德地图", desc: "地点搜索、路线规划、周边、天气", status: "planned" },
  { id: "mcdonalds", name: "麦当劳", desc: "门店、菜单、优惠券、点餐", status: "planned" },
];

export default async function toolsRoute(app) {
  app.get("/api/tools", async () => ({ servers: MCP_SERVERS }));

  app.post("/api/tools/:name", async (req, reply) => {
    const server = MCP_SERVERS.find((s) => s.id === req.params.name);
    reply.code(server ? 501 : 404);
    return {
      error: server ? "not_implemented" : "not_found",
      message: server ? `「${server.name}」MCP 还没接入，后期再做` : "没有这个 MCP 服务",
    };
  });
}
