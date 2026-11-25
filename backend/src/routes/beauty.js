// 美化设置的云端备份：iOS 每次「添加到主屏幕」都是一份全新的本地存储，只放 localStorage 会整套丢掉。
// 只存设置 JSON（不含壁纸/照片，那些还在设备的 IndexedDB 里），存 memory/beauty.json（gitignore）。
import { paths, readJSON, writeJSON, DATA_DIR } from "../storage.js";

const MAX_BYTES = 256 * 1024;

export default async function beautyRoute(app) {
  app.get("/api/beauty", async () => {
    const data = await readJSON(paths.beauty(DATA_DIR), null);
    return data && typeof data.beauty === "object" ? data : { beauty: null, savedAt: 0 };
  });

  // { beauty: {...}, savedAt: number }：只收比现有更新的那份，旧设备不会把新设置盖回去
  app.put("/api/beauty", { bodyLimit: MAX_BYTES }, async (req, reply) => {
    const { beauty, savedAt } = req.body || {};
    if (!beauty || typeof beauty !== "object" || Array.isArray(beauty) || !Number.isFinite(savedAt) || savedAt <= 0) {
      reply.code(400);
      return { error: "bad_input", message: "需要 beauty 对象和 savedAt 时间" };
    }
    const current = await readJSON(paths.beauty(DATA_DIR), null);
    if (current && Number.isFinite(current.savedAt) && current.savedAt > savedAt) {
      reply.code(409);
      return { error: "stale", message: "云端已有更新的美化设置", savedAt: current.savedAt };
    }
    await writeJSON(paths.beauty(DATA_DIR), { beauty, savedAt });
    return { ok: true, savedAt };
  });
}
