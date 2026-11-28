// 思考翻译：前端展开思考框时按需调用，翻完就缓存（后端内存 + 前端组件内）。
// 免费方案，不依赖任何 key；失败一律温和返回，不打扰主流程。
import { translateThought, needsTranslation } from "../translate-thought.js";

const MAX_TEXT = 12000;

export default async function thoughtRoute(app) {
  app.post("/api/thought/translate", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const text = String(req.body?.text ?? "");
    if (!text.trim()) return reply.code(400).send({ error: "empty", message: "没有要翻译的内容" });
    if (text.length > MAX_TEXT) return reply.code(413).send({ error: "too_long", message: "这段思考太长了，没有翻" });
    if (!needsTranslation(text)) return reply.send({ text: "", skipped: "not_needed" });

    const out = await translateThought(text);
    if (!out) return reply.send({ text: "", skipped: "unavailable" });
    return reply.send({ text: out });
  });
}
