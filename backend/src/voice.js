// MiniMax 语音：合成（/v1/t2a_v2）与识别（/v1/speech_to_text）
// Key 只在后端使用；前端只拿到脱敏状态。音频不落盘，合成完直接回给浏览器。

export const DEFAULT_VOICE = {
  enabled: false,
  baseUrl: "https://api.minimax.cn", // 国内站；国际站是 https://api.minimax.io
  apiKey: "",
  groupId: "",
  ttsModel: "speech-2.8-turbo",
  asrModel: "asr-1.0",
  voiceId: "female-tianmei",
  speed: 1,
  language: "auto",   // language_boost（TTS）/ language（ASR）
  ttsPrompt: "",      // 朗读风格提示词，尽力传给 MiniMax（见 synthesize）
};

/** 常用音色，设置页下拉用；也可以手填别的 voice_id */
export const VOICE_PRESETS = [
  { id: "female-tianmei", name: "甜美女声" },
  { id: "female-shaonv", name: "少女" },
  { id: "female-yujie", name: "御姐" },
  { id: "female-chengshu", name: "成熟女性" },
  { id: "male-qn-qingse", name: "青涩青年" },
  { id: "male-qn-jingying", name: "精英青年" },
  { id: "male-qn-badao", name: "低沉男声" },
  { id: "audiobook_female_1", name: "有声书女声" },
  { id: "audiobook_male_1", name: "有声书男声" },
];

/** TTS 模型：设置页下拉；仍可手填别的值 */
export const TTS_MODELS = [
  { id: "speech-2.8-hd", name: "2.8 高保真（推荐）" },
  { id: "speech-2.8-turbo", name: "2.8 极速" },
  { id: "speech-2.6-hd", name: "2.6 高保真" },
  { id: "speech-2.6-turbo", name: "2.6 极速" },
  { id: "speech-02-hd", name: "02 高保真" },
  { id: "speech-02-turbo", name: "02 极速" },
];

/** ASR 模型 */
export const ASR_MODELS = [
  { id: "asr-1.0", name: "ASR 1.0" },
];

/** 语种：对应 TTS 的 language_boost / ASR 的 language 头 */
export const VOICE_LANGUAGES = [
  { id: "auto", name: "自动识别" },
  { id: "Chinese", name: "中文普通话" },
  { id: "Chinese,Yue", name: "粤语" },
  { id: "English", name: "英语" },
  { id: "Japanese", name: "日语" },
  { id: "Korean", name: "韩语" },
  { id: "French", name: "法语" },
  { id: "German", name: "德语" },
  { id: "Spanish", name: "西班牙语" },
  { id: "Portuguese", name: "葡萄牙语" },
  { id: "Russian", name: "俄语" },
  { id: "Italian", name: "意大利语" },
  { id: "Thai", name: "泰语" },
  { id: "Indonesian", name: "印尼语" },
  { id: "Vietnamese", name: "越南语" },
];

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * 清理 Key：从文档/聊天里复制时经常带进 markdown 复选框、列表符号，
 * 例如 "- [ ] sk-cp-xxx"。这些前缀会让 MiniMax 返回 1004 login fail。
 */
function cleanKey(value) {
  let k = typeof value === "string" ? value.trim() : "";
  // 去掉开头的 "- [ ] " / "* [x] " / "1. " 之类
  k = k.replace(/^\s*(?:\d+[.)]\s*)?(?:[-*+]\s*)?(?:\[[ xX]\]\s*)?/, "").trim();
  // 前端回传的打码串不是 Key
  if (!k || k.includes("****") || k === "-") return "";
  return k.slice(0, 400);
}

// 只接受 MiniMax 支持的语种值，其余回落 auto
const LANG_IDS = new Set(VOICE_LANGUAGES.map((l) => l.id));
const normLang = (v, prev) => {
  const lang = str(v ?? prev, 40);
  return LANG_IDS.has(lang) ? lang : "auto";
};

// TTS 的 language_boost 值（Chinese/English…）转成 ASR 头用的 BCP-47 码（zh/en…）
const ASR_LANG = {
  "Chinese": "zh", "Chinese,Yue": "zh-HK", "English": "en", "Japanese": "ja",
  "Korean": "ko", "French": "fr", "German": "de", "Spanish": "es",
  "Portuguese": "pt", "Russian": "ru", "Italian": "it", "Thai": "th",
  "Indonesian": "id", "Vietnamese": "vi",
};
const toAsrLang = (lang) => {
  if (!lang || lang === "auto") return "";
  // 已经是 BCP-47（前端传来的 zh / en-US）直接用
  if (/^[a-z]{2}(-[A-Za-z]{2,})?$/.test(lang)) return lang;
  return ASR_LANG[lang] || "";
};

/** 归一化语音配置：只认 http(s) 地址，速度限制在 0.5–2 */
export function normVoice(raw, prev = DEFAULT_VOICE) {
  const v = raw && typeof raw === "object" ? raw : {};
  const base = str(v.baseUrl ?? prev.baseUrl, 200).replace(/\/+$/, "");
  const speed = Number(v.speed ?? prev.speed);
  const key = cleanKey(v.apiKey) || cleanKey(prev.apiKey);
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : !!prev.enabled,
    baseUrl: /^https?:\/\//i.test(base) ? base : DEFAULT_VOICE.baseUrl,
    apiKey: key,
    groupId: typeof v.groupId === "string" ? v.groupId.trim().slice(0, 64) : prev.groupId || "",
    ttsModel: str(v.ttsModel ?? prev.ttsModel, 60) || DEFAULT_VOICE.ttsModel,
    asrModel: str(v.asrModel ?? prev.asrModel, 60) || DEFAULT_VOICE.asrModel,
    voiceId: str(v.voiceId ?? prev.voiceId, 60) || DEFAULT_VOICE.voiceId,
    speed: Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : 1,
    language: normLang(v.language ?? prev.language, "auto"),
    ttsPrompt: str(v.ttsPrompt ?? prev.ttsPrompt, 300),
  };
}

export function publicVoice(v) {
  const key = v.apiKey || "";
  return {
    enabled: !!v.enabled,
    baseUrl: v.baseUrl,
    groupId: v.groupId,
    ttsModel: v.ttsModel,
    asrModel: v.asrModel,
    voiceId: v.voiceId,
    speed: v.speed,
    language: v.language || "auto",
    ttsPrompt: v.ttsPrompt || "",
    hasKey: !!key,
    keyMask: key ? (key.length > 7 ? `${key.slice(0, 3)}****${key.slice(-4)}` : "****") : "",
    presets: VOICE_PRESETS,
    ttsModels: TTS_MODELS,
    asrModels: ASR_MODELS,
    languages: VOICE_LANGUAGES,
  };
}

/** 语音接口的错误：status 用于映射成 4xx/5xx，message 是可以直接给用户看的中文 */
export class VoiceError extends Error {
  constructor(message, status = 502, code = "voice_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const miniStatus = (data) => (typeof data?.base_resp?.status_code === "number" ? data.base_resp.status_code : null);
const miniMessage = (data) => str(data?.base_resp?.status_msg, 120);

function checkConfig(cfg, needGroup = false) {
  if (!cfg.enabled) throw new VoiceError("语音还没打开，去 设置 → 语音 里开一下", 400, "voice_off");
  if (!cfg.apiKey) throw new VoiceError("还没填 MiniMax API Key", 400, "no_voice_key");
  if (needGroup && !cfg.groupId) throw new VoiceError("还没填 GroupId（MiniMax 控制台里那一串数字）", 400, "no_group");
}

/** 文本转语音：返回 mp3 的 Buffer */
export async function synthesize(text, cfg) {
  checkConfig(cfg, false);
  const body = {
    model: cfg.ttsModel,
    text: String(text || "").slice(0, 3000),
    stream: false,
    voice_setting: { voice_id: cfg.voiceId, speed: cfg.speed, vol: 1, pitch: 0 },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
    language_boost: cfg.language && cfg.language !== "auto" ? cfg.language : "auto",
  };
  // 朗读风格提示词：MiniMax 官方 t2a_v2 文档未列出独立 prompt 字段，
  // 但顶层 prompt 会被接口接受且不报错。这里尽力而为：有就带上，
  // 不支持该字段的模型会忽略它，不影响正常合成。
  if (cfg.ttsPrompt) body.prompt = cfg.ttsPrompt;
  if (!body.text.trim()) throw new VoiceError("没有可以读的文字", 400, "empty_text");

  let res;
  try {
    const qs = cfg.groupId ? `?GroupId=${encodeURIComponent(cfg.groupId)}` : "";
    res = await fetch(`${cfg.baseUrl}/v1/t2a_v2${qs}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new VoiceError(e?.name === "TimeoutError" ? "MiniMax 合成超时了，再试一次" : `连不上 MiniMax：${e.message}`, 504, "voice_network");
  }

  const data = await res.json().catch(() => null);
  const code = miniStatus(data);
  if (!res.ok || (code !== null && code !== 0)) {
    const why = miniMessage(data) || `接口返回 ${res.status}`;
    const status = res.status === 401 || res.status === 403 || code === 1004 ? 401 : 502;
    throw new VoiceError(`MiniMax 合成失败：${why}`, status, status === 401 ? "voice_auth" : "voice_failed");
  }
  const hex = data?.data?.audio;
  if (typeof hex !== "string" || !hex) throw new VoiceError("MiniMax 没有返回音频", 502, "voice_empty");
  return Buffer.from(hex, "hex");
}

/** 语音转文字：audio 是二进制（wav/mp3/ogg…），返回识别文本 */
export async function transcribe(audio, mime, cfg, language = "") {
  checkConfig(cfg);
  const type = /^audio\/[\w.+-]+$/.test(mime || "") ? mime : "audio/wav";
  const ext = type.includes("mpeg") ? "mp3" : type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "wav";
  const form = new FormData();
  form.append("model", cfg.asrModel);
  form.append("response_format", "json");
  form.append("file", new Blob([audio], { type }), `voice.${ext}`);

  // 请求头里的语种优先，其次用设置里的；注意 ASR 头要 BCP-47 码（zh/en），
  // 不是 TTS 的 language_boost 值（Chinese），传错会被 MiniMax 判 400
  const lang = toAsrLang(language) || toAsrLang(cfg.language);

  let res;
  try {
    res = await fetch(`${cfg.baseUrl}/v1/speech_to_text`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        ...(lang ? { language: lang } : {}),
      },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    throw new VoiceError(e?.name === "TimeoutError" ? "识别超时了，说短一点再试" : `连不上 MiniMax：${e.message}`, 504, "voice_network");
  }

  const data = await res.json().catch(() => null);
  const code = miniStatus(data);
  if (!res.ok || (code !== null && code !== 0)) {
    const why = miniMessage(data) || `接口返回 ${res.status}`;
    const status = res.status === 401 || res.status === 403 ? 401 : 502;
    throw new VoiceError(`识别失败：${why}`, status, status === 401 ? "voice_auth" : "voice_failed");
  }
  const text = str(data?.text, 4000);
  if (!text) throw new VoiceError("没听清，再说一遍？", 422, "voice_empty");
  return { text, duration: Number(data?.duration) || 0 };
}
