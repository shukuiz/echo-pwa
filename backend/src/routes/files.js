// 文件读写：memory/files/ 下的预设、世界书、小应用等，索引入 index.json，正文存独立文件
import fs from "node:fs/promises";
import { paths, readJSON, writeJSON, uid, safeJoin, DATA_DIR } from "../storage.js";

const KINDS = ["worldbook", "preset", "miniapp", "script"];

export default async function filesRoute(app) {
  // 列表（不含正文）
  app.get("/api/files", async () => {
    const index = await readJSON(paths.filesIndex(DATA_DIR), []);
    return { files: index };
  });

  // 读单个文件（含正文）
  app.get("/api/files/:id", async (req, reply) => {
    const index = await readJSON(paths.filesIndex(DATA_DIR), []);
    const meta = index.find((f) => f.id === req.params.id);
    if (!meta) { reply.code(404); return { error: "not_found" }; }
    try {
      const file = safeJoin(paths.files(DATA_DIR), meta.stored);
      const content = await fs.readFile(file, "utf8");
      return { ...meta, content };
    } catch {
      reply.code(404);
      return { error: "content_missing" };
    }
  });

  // 新建/写入文件 { kind, name, content, via }
  app.post("/api/files", async (req, reply) => {
    const { kind, name, content = "", via = "API" } = req.body || {};
    if (!KINDS.includes(kind) || !name) { reply.code(400); return { error: "bad_input" }; }
    const id = uid();
    const stored = `${id}-${String(name).replace(/[^\w.\-一-龥]/g, "_")}`;
    const file = safeJoin(paths.files(DATA_DIR), stored);
    await fs.writeFile(file, content, "utf8");
    const index = await readJSON(paths.filesIndex(DATA_DIR), []);
    const meta = { id, kind, name, via, at: Date.now(), stored };
    index.unshift(meta);
    await writeJSON(paths.filesIndex(DATA_DIR), index);
    return { ...meta, content };
  });

  // 删除文件
  app.delete("/api/files/:id", async (req, reply) => {
    const index = await readJSON(paths.filesIndex(DATA_DIR), []);
    const meta = index.find((f) => f.id === req.params.id);
    if (!meta) { reply.code(404); return { error: "not_found" }; }
    try { await fs.unlink(safeJoin(paths.files(DATA_DIR), meta.stored)); } catch {}
    await writeJSON(paths.filesIndex(DATA_DIR), index.filter((f) => f.id !== req.params.id));
    return { ok: true };
  });
}
