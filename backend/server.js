// echo 轻量后端入口：Fastify，零重型依赖，适合 4 GiB 内存常开
import Fastify from "fastify";
import cors from "@fastify/cors";
import { installAuth } from "./src/auth.js";
import { ensureDataTree, DATA_DIR } from "./src/storage.js";
import chatRoute from "./src/routes/chat.js";
import memoryRoute from "./src/routes/memory.js";
import filesRoute from "./src/routes/files.js";
import toolsRoute from "./src/routes/tools.js";
import settingsRoute from "./src/routes/settings.js";

const app = Fastify({
  logger: false, // 不打印请求日志，避免泄露敏感信息
  bodyLimit: 4 * 1024 * 1024,
});

const secured = installAuth(app);
await ensureDataTree(DATA_DIR);

if (!secured) {
  await app.register(cors, {
    origin: true, // 兼容旧的直连前端
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });
}

// 健康检查
app.get("/api/health", async () => ({ ok: true, ts: Date.now() }));

await app.register(chatRoute);
await app.register(memoryRoute);
await app.register(filesRoute);
await app.register(toolsRoute);
await app.register(settingsRoute);

const PORT = Number(process.env.ECHO_PORT || 8787);
const HOST = process.env.ECHO_HOST || "0.0.0.0";

try {
  await app.listen({ port: PORT, host: HOST });
  // 仅输出非敏感启动信息
  console.log(`echo backend listening on ${HOST}:${PORT}`);
} catch (err) {
  console.error("failed to start:", err.message);
  process.exit(1);
}
