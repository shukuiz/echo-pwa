// 语音接口：MiniMax 合成（TTS）/ 识别（ASR）。音频只在这一次请求里过，不落盘。
import { getRawConfig } from "../config.js";
import { synthesize, transcribe, VoiceError, publicVoice, normVoice } from "../voice.js";

const MAX_AUDIO = 8 * 1024 * 1024; // 8MB：16kHz 单声道 wav 约 8 分钟
const MAX_TTS_CHARS = 3000;

const fail = (reply, e) => {
  const status = e instanceof VoiceError ? e.status : 502;
  return reply.code(status).send({ error: e.code || "voice_failed", message: e.message });
};

export default async function voiceRoute(app) {
  // 浏览器直接发二进制音频（audio/wav 等），不走 base64，省 1/3 体积
  app.addContentTypeParser(
    ["audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "application/octet-stream"],
    { parseAs: "buffer", bodyLimit: MAX_AUDIO },
    (_req, body, done) => done(null, body),
  );

  const voice = async () => {
    const raw = await getRawConfig();
    return normVoice(raw.voice);
  };

  app.get("/api/voice/status", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return publicVoice(await voice());
  });

  // 合成：body { text } → 直接回 mp3 二进制
  app.post("/api/voice/tts", { bodyLimit: 32 * 1024 }, async (req, reply) => {
    const text = String(req.body?.text ?? "").slice(0, MAX_TTS_CHARS);
    if (!text.trim()) return reply.code(400).send({ error: "empty_text", message: "没有要读的文字" });
    try {
      const audio = await synthesize(text, await voice());
      reply.header("Content-Type", "audio/mpeg");
      reply.header("Cache-Control", "no-store");
      return reply.send(audio);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // 识别：body 是音频二进制 → { text, duration }
  app.post("/api/voice/asr", { bodyLimit: MAX_AUDIO }, async (req, reply) => {
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || !audio.length) {
      return reply.code(400).send({ error: "no_audio", message: "没有收到录音" });
    }
    if (audio.length > MAX_AUDIO) return reply.code(413).send({ error: "too_big", message: "录音太长了，说短一点" });
    try {
      const language = /^[a-z]{2}(-[A-Za-z]{2,})?$/.test(String(req.headers["x-echo-language"] || "")) ? String(req.headers["x-echo-language"]) : "";
      const out = await transcribe(audio, String(req.headers["content-type"] || ""), await voice(), language);
      return out;
    } catch (e) {
      return fail(reply, e);
    }
  });

  // 试听：用当前设置合成一小句，设置页点「试听」用
  app.post("/api/voice/test", { bodyLimit: 4096 }, async (_req, reply) => {
    try {
      const audio = await synthesize("你好呀，我是 echo。这样说话，你听着还习惯吗？", await voice());
      reply.header("Content-Type", "audio/mpeg");
      reply.header("Cache-Control", "no-store");
      return reply.send(audio);
    } catch (e) {
      return fail(reply, e);
    }
  });
}
