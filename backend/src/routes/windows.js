// 换窗 / 历史窗口：
// GET  /api/windows                 窗口列表（当前窗口 + 历史窗口，新的在前）和上次的续接选择
// GET  /api/windows/:id             读一个窗口（历史窗口只读）
// GET  /api/windows/shadow/latest   最新一篇窗影（两张画像只读展示）
// POST /api/windows/preview         按选择预览要带进新窗口的资料（Serein /v1/extensions/resume，不注入、不保存）
// GET  /api/windows/candidates      自选资料的候选（Serein resume-candidates）
// POST /api/windows/switch          换窗 { selection, skipShadow?, skipContinuity? }
import { getConfig } from "../config.js";
import { sereinCore, latestShadow, readResume, resumeCandidates } from "../serein-client.js";
import { continuityMode, listWindows, normSelection, readWindow, switchWindow } from "../windows.js";
import { activeWindow } from "../windows-store.js";

const MODE_LABEL = { resume: "Serein 网关 · /resume", codex: "Codex · 新线程预装资料", prompt: "普通接口 · 资料放进系统提示" };

export default async function windowsRoute(app) {
  const guard = (fn) => async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    try { return await fn(req, reply); } catch (e) {
      reply.code(e.statusCode || (e.status >= 400 && e.status < 600 ? e.status : 502));
      return { error: e.stage || "windows", stage: e.stage, message: e.message || "出了点状况" };
    }
  };

  app.get("/api/windows", guard(async () => {
    const cfg = await getConfig();
    const mode = continuityMode(cfg);
    return { ...(await listWindows()), mode, modeLabel: MODE_LABEL[mode], serein: sereinCore().configured };
  }));
  app.get("/api/windows/shadow/latest", guard(async () => ({ shadow: await latestShadow() })));
  app.post("/api/windows/preview", { bodyLimit: 32 * 1024 }, guard(async (req) => {
    const selection = normSelection(req.body?.selection);
    const win = await activeWindow();
    const packet = await readResume({ windowId: "echo-preview", sourceSessionId: win.sereinWindowId, selection });
    const counts = {};
    for (const it of packet.items) counts[it.section] = (counts[it.section] || 0) + 1;
    return {
      selection, counts, totals: packet.totals, chars: packet.items.reduce((n, it) => n + (it.body_md?.length || 0), 0),
      items: packet.items.map((it) => ({ id: it.id, kind: it.kind, section: it.section, title: it.title, role: it.role, createdAt: it.created_at, body: it.body_md })),
    };
  }));
  app.get("/api/windows/candidates", guard(async (req) => {
    const q = req.query || {};
    const kind = ["event", "scene"].includes(q.kind) ? q.kind : "";
    return resumeCandidates({ kind, q: String(q.q || "").slice(0, 200), offset: Math.max(0, Number(q.offset) || 0), limit: 30 });
  }));
  app.get("/api/windows/:id", guard(async (req) => readWindow(String(req.params.id))));
  app.post("/api/windows/switch", { bodyLimit: 32 * 1024 }, guard(async (req) => {
    const b = req.body || {};
    return switchWindow({ selection: b.selection, skipShadow: b.skipShadow === true, skipContinuity: b.skipContinuity === true });
  }));
}
