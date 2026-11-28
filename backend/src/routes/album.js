import fs from "node:fs/promises";
import path from "node:path";
import { paths, readJSON, writeJSON, DATA_DIR, uid } from "../storage.js";

const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const readIndex = async () => (await readJSON(paths.albumIndex(DATA_DIR), { items: [] }));

// 相册列表、图片存取及删除接口。
export default async function albumRoute(app) {
  app.get("/api/album/list", async (req) => {
    const who = req.query?.who || "all";
    const { items = [] } = await readIndex();
    return { items: items.filter((item) => who === "all" || item.who === who).sort((a, b) => b.at - a.at) };
  });
  app.get("/api/album/file/:id", async (req, reply) => {
    const { items = [] } = await readIndex();
    const item = items.find((entry) => entry.id === req.params.id);
    if (!item) return reply.code(404).send({ error: "not_found" });
    try {
      const data = await fs.readFile(path.join(paths.albumDir(DATA_DIR), "files", `${item.id}.${item.ext}`));
      reply.header("Content-Type", MIME[item.ext] || "application/octet-stream").header("Cache-Control", "private, max-age=3600");
      return reply.send(data);
    } catch { return reply.code(404).send({ error: "not_found" }); }
  });
  app.post("/api/album/save", { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const { who, dataUrl, title = "", source = "upload" } = req.body || {};
    const match = typeof dataUrl === "string" && dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/i);
    if (!/^(mine|echo)$/.test(who) || !match) return reply.code(400).send({ error: "bad_input" });
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 3 * 1024 * 1024) return reply.code(413).send({ error: "too_large" });
    const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    const item = { id: uid(), who, title: String(title).slice(0, 100), at: Date.now(), size: buffer.length, source, ext };
    const index = await readIndex();
    index.items = Array.isArray(index.items) ? index.items : [];
    await fs.mkdir(path.join(paths.albumDir(DATA_DIR), "files"), { recursive: true });
    await fs.writeFile(path.join(paths.albumDir(DATA_DIR), "files", `${item.id}.${ext}`), buffer);
    index.items.push(item);
    index.items.sort((a, b) => b.at - a.at);
    while (index.items.length > 300) { const old = index.items.pop(); await fs.rm(path.join(paths.albumDir(DATA_DIR), "files", `${old.id}.${old.ext || "png"}`), { force: true }); }
    await writeJSON(paths.albumIndex(DATA_DIR), index);
    return item;
  });
  app.delete("/api/album/:id", async (req, reply) => {
    const index = await readIndex();
    const at = index.items.findIndex((item) => item.id === req.params.id);
    if (at < 0) return reply.code(404).send({ error: "not_found" });
    const [item] = index.items.splice(at, 1);
    await fs.rm(path.join(paths.albumDir(DATA_DIR), "files", `${item.id}.${item.ext || "png"}`), { force: true });
    await writeJSON(paths.albumIndex(DATA_DIR), index);
    return { ok: true };
  });
}
