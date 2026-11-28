// 附件解析：把用户上传的文件抽成文字，交给聊天一起发。文件不落盘，解析完就丢。
import { VoiceError } from "../voice.js";

const MAX_BYTES = 3 * 1024 * 1024; // 3MB：再大就别塞进上下文了
const MAX_CHARS = 200_000;         // 20 万字，约等于一整本书的几章

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "log", "yml", "yaml", "xml", "html", "htm",
  "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "kt", "c", "h",
  "cpp", "hpp", "cs", "php", "sh", "bash", "zsh", "sql", "ini", "conf", "toml", "env", "srt", "vtt",
]);

const extOf = (name) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
};

/**
 * PDF 抽出来的字要清一遍：
 * - Chromium / 部分排版软件会把汉字写成「康熙部首」（⽂ → 文），NFKC 归一回去
 * - 分页标记「-- 1 of 3 --」去掉
 */
function tidy(text) {
  let s = String(text || "");
  if (/[\u2E80-\u2FDF\uF900-\uFAFF]/.test(s)) s = s.normalize("NFKC");
  return s;
}

/** 动态 import：依赖没装时给出能看懂的话，而不是 500 */
async function load(module, hint) {
  try {
    return await import(module);
  } catch {
    throw new VoiceError(`${hint} 解析组件没装好，让服务器跑一次 npm install`, 503, "extract_unavailable");
  }
}

export default async function attachRoute(app) {
  // body { name, mime, data: base64 }
  app.post("/api/attach/extract", { bodyLimit: 6 * 1024 * 1024 }, async (req, reply) => {
    const { name, mime, data } = req.body || {};
    const fileName = String(name || "未命名").slice(0, 120);
    if (typeof data !== "string" || !data) {
      return reply.code(400).send({ error: "bad_input", message: "没有收到文件内容" });
    }
    const base64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
    let buf;
    try {
      buf = Buffer.from(base64, "base64");
    } catch {
      return reply.code(400).send({ error: "bad_input", message: "文件内容解不开" });
    }
    if (!buf.length) return reply.code(400).send({ error: "bad_input", message: "文件是空的" });
    if (buf.length > MAX_BYTES) {
      return reply.code(413).send({ error: "too_big", message: `文件超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 了，拆小一点再发` });
    }

    const ext = extOf(fileName);
    const type = String(mime || "");
    let text = "";
    try {
      if (TEXT_EXT.has(ext) || type.startsWith("text/") || type === "application/json") {
        text = buf.toString("utf8");
      } else if (ext === "pdf" || type === "application/pdf") {
        const mod = await load("pdf-parse", "PDF");
        const parser = new mod.PDFParse({ data: buf });
        try {
          const out = await parser.getText();
          text = tidy(String(out?.text || ""));
        } finally {
          await parser.destroy?.();
        }
      } else if (ext === "docx" || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const mod = await load("mammoth", "Word");
        const out = await mod.default.extractRawText({ buffer: buf });
        text = String(out?.value || "");
      } else if (ext === "doc") {
        return reply.code(415).send({ error: "unsupported", message: "老版 .doc 读不了，用 Word 另存成 .docx 再发" });
      } else {
        return reply.code(415).send({ error: "unsupported", message: `暂时读不了 .${ext || "这种"} 文件，支持：文本类、PDF、Word(.docx)` });
      }
    } catch (e) {
      if (e instanceof VoiceError) return reply.code(e.status).send({ error: e.code, message: e.message });
      return reply.code(422).send({ error: "parse_failed", message: "这个文件没能读出文字，可能加密了或者是扫描件" });
    }

    text = text
      .replace(/\u0000/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/\n*--\s*\d+\s+of\s+\d+\s*--\n*/gi, "\n") // pdf-parse 的「-- 1 of 3 --」分页标记
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) {
      return reply.code(422).send({ error: "empty_text", message: "文件里没有能读的文字（扫描版 PDF 需要 OCR，暂时不支持）" });
    }
    // 字体没带文字层时，抽出来是「æµ‹è¯•」这种乱码：别把垃圾塞给模型
    const latin = (text.match(/[\u0080-\u00FF]/g) || []).length;
    if (latin > 20 && latin / text.length > 0.3) {
      return reply.code(422).send({ error: "garbled", message: "这个 PDF 的文字层是乱码（字体没带编码表），截图发我更快" });
    }
    const truncated = text.length > MAX_CHARS;
    return { name: fileName, chars: text.length, truncated, text: truncated ? text.slice(0, MAX_CHARS) : text };
  });
}
