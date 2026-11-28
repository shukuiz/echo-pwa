// 后端配置读写：API Key / 接口地址只存后端 settings，绝不进前端代码、不进 Git、不打印日志
import { randomBytes } from "node:crypto";
import { paths, readJSON, writeJSON, DATA_DIR } from "./storage.js";
import { DEFAULT_THINKING, normThinking } from "./thinking.js";
import { DEFAULT_CODEX, normCodex } from "./codex.js";
import { DEFAULT_TIMEOUTS, normTimeouts } from "./timeouts.js";
import { DEFAULT_VOICE, normVoice, publicVoice } from "./voice.js";

// 官方接口地址：官方 API 模式下固定使用，不需要用户填写
// Anthropic 走官方 OpenAI 兼容层（https://api.anthropic.com/v1/），复用同一套 /chat/completions 转发
export const OFFICIAL_BASES = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};
export const OFFICIAL_PROVIDERS = Object.keys(OFFICIAL_BASES);
const MAX_PRESETS = 20;

const DEFAULT_CONFIG = {
  apiMode: "official", // official | custom | codex（ChatGPT 订阅，走服务器上的 codex app-server）
  codex: { ...DEFAULT_CODEX }, // Codex 连接：{ model, effort, showThinking }
  voice: { ...DEFAULT_VOICE }, // 语音：{ enabled, baseUrl, apiKey, groupId, ttsModel, asrModel, voiceId, speed }
  timeouts: { ...DEFAULT_TIMEOUTS }, // 回复等待（秒）：{ firstToken, codexFirstToken, stall, total }
  provider: "openai", // 官方模式下的厂商：openai | deepseek | anthropic
  officialKeys: {}, // { openai: "sk-…", deepseek: "…", anthropic: "…" } 各官方 Key 分开保存，切换不丢
  officialModels: {},
  officialThinking: {}, // { openai: {mode, format, effort, budget, extra, cotPrompt} } 每个官方连接各自的思考设置
  presets: [], // 自定义预设：[{ id, name, url, apiKey, model?, thinking? }]
  activePresetId: "",
  anthropicWorkspaceId: "", // 可选：未限定 workspace 的 Claude 个人/服务账户 Key 需要带 anthropic-workspace-id
  model: "gpt-4o-mini",
  models: ["gpt-4o-mini", "gpt-4o", "deepseek-chat"],
  codexEnabled: true,
  claudeEnabled: true,
  defaultHand: "claude",
  quietThink: true,
  showStatusBar: true,
  mute: false,
  tools: {},
};

const normBase = (u) => String(u || "").replace(/\/+$/, "");
export const presetId = () => randomBytes(6).toString("hex");

/** 旧版单 Key / 单地址配置迁移为「官方 Key」或「自定义预设」 */
function migrate(raw) {
  if (raw.apiMode) return raw;
  const next = { ...raw };
  const legacyKey = String(raw.apiKey || "");
  const legacyUrl = normBase(raw.proxyUrl);
  const official = OFFICIAL_PROVIDERS.includes(raw.provider) && OFFICIAL_BASES[raw.provider];
  if (!legacyUrl || (official && normBase(official) === legacyUrl)) {
    next.apiMode = "official";
    next.provider = official ? raw.provider : "openai";
    next.officialKeys = legacyKey ? { [next.provider]: legacyKey } : {};
  } else {
    const id = "legacy";
    next.apiMode = "custom";
    next.provider = official ? raw.provider : "openai";
    next.officialKeys = {};
    next.presets = [{ id, name: "默认预设", url: legacyUrl, apiKey: legacyKey }];
    next.activePresetId = id;
  }
  delete next.apiKey;
  delete next.proxyUrl;
  return next;
}

/** 读取存盘的原始配置（含全部 Key，仅后端内部使用） */
export async function getRawConfig() {
  const raw = await readJSON(paths.config(DATA_DIR), {});
  const stored = migrate(raw);
  return { ...DEFAULT_CONFIG, ...stored, officialKeys: { ...stored.officialKeys }, officialModels: { ...stored.officialModels }, officialThinking: { ...stored.officialThinking }, presets: stored.presets || [], codex: normCodex(stored.codex), voice: normVoice(stored.voice), timeouts: normTimeouts(stored.timeouts, undefined, { lenient: true }) };
}

/** 当前生效的上游：官方厂商或选中的自定义预设 */
export function activeUpstream(raw) {
  if (raw.apiMode === "codex") return { kind: "codex", proxyUrl: "", apiKey: "" };
  if (raw.apiMode === "custom") {
    const preset = raw.presets.find((p) => p.id === raw.activePresetId);
    return { kind: "custom", preset, proxyUrl: preset ? normBase(preset.url) : "", apiKey: preset?.apiKey || "" };
  }
  const provider = OFFICIAL_PROVIDERS.includes(raw.provider) ? raw.provider : "openai";
  return { kind: provider, proxyUrl: OFFICIAL_BASES[provider], apiKey: raw.officialKeys?.[provider] || "" };
}

/** 当前连接的思考设置（没设置过 = 关） */
export function activeThinking(raw, up = activeUpstream(raw)) {
  const t = up.preset ? up.preset.thinking : raw.officialThinking?.[up.kind];
  return { ...DEFAULT_THINKING, ...(t && typeof t === "object" ? t : {}), saved: !!(t && typeof t === "object") };
}

/** 读取完整配置：附带当前生效的 provider / proxyUrl / apiKey / thinking，供聊天与模型请求使用 */
export async function getConfig() {
  const raw = await getRawConfig();
  const up = activeUpstream(raw);
  return { ...raw, provider: up.kind, proxyUrl: up.proxyUrl, apiKey: up.apiKey, thinking: activeThinking(raw, up) };
}

/** 合并写入原始配置 */
export async function saveRawConfig(next) {
  const clean = { ...next };
  delete clean.apiKey;
  delete clean.proxyUrl;
  await writeJSON(paths.config(DATA_DIR), clean);
  return clean;
}

let pendingWrite = Promise.resolve();

function updateConfig(change) {
  const result = pendingWrite.then(async () => saveRawConfig(change(await getRawConfig())));
  pendingWrite = result.then(() => {}, () => {});
  return result;
}

function setActiveModel(config, model) {
  const { kind, preset } = activeUpstream(config);
  if (kind === "codex") return; // Codex 的模型单独存在 config.codex.model
  config.model = model;
  if (preset) preset.model = model;
  else if (kind !== "custom") config.officialModels[kind] = model;
  if (model && !config.models.includes(model)) config.models = [model, ...config.models];
}

function configuredModel(config) {
  const { kind, preset } = activeUpstream(config);
  return kind === "custom" ? preset?.model : config.officialModels[kind];
}

function draftModel(model) {
  const value = typeof model === "string" ? model.trim() : "";
  if (!value || value.length > 200) throw new Error("请输入聊天模型，最多 200 个字符");
  return value;
}

/** 处理设置页的修改；返回新原始配置。抛出带 message 的错误表示参数不合法 */
export async function applySettingsPatch(body) {
  return updateConfig((next) => {
    const previous = activeUpstream(next);
    const official = body.officialConnection;

    if (body.apiMode === "official" || body.apiMode === "custom" || body.apiMode === "codex") next.apiMode = body.apiMode;
    if (body.codex !== undefined) next.codex = normCodex(body.codex, next.codex);
    if (body.voice !== undefined) next.voice = normVoice(body.voice, next.voice);
    if (body.timeouts !== undefined) next.timeouts = normTimeouts(body.timeouts, next.timeouts);
    if (OFFICIAL_PROVIDERS.includes(body.provider)) next.provider = body.provider;
    if (typeof body.activePresetId === "string") {
      if (body.activePresetId && !next.presets.some((p) => p.id === body.activePresetId)) throw new Error("连接不存在");
      next.activePresetId = body.activePresetId;
    }

    if (official) {
      const { provider, model, apiKey, anthropicWorkspaceId, activate, thinking } = official;
      if (!OFFICIAL_PROVIDERS.includes(provider)) throw new Error("未知的官方服务");
      next.officialModels[provider] = draftModel(model);
      if (thinking !== undefined) next.officialThinking[provider] = normThinking(thinking, next.officialThinking[provider]);
      if (typeof apiKey === "string") next.officialKeys[provider] = apiKey.trim();
      if (provider === "anthropic" && typeof anthropicWorkspaceId === "string") {
        next.anthropicWorkspaceId = anthropicWorkspaceId.trim();
      }
      if (activate === true) {
        next.apiMode = "official";
        next.provider = provider;
      }
    }

    // 旧接口写入当前连接的 Key，保留其请求格式。
    const active = activeUpstream(next);
    if (typeof body.apiKey === "string") {
      const key = body.apiKey.trim();
      if (active.preset) active.preset.apiKey = key;
      else if (active.kind === "custom") throw new Error("请先新建或选择一个自定义连接");
      else next.officialKeys[active.kind] = key;
    }

    if (typeof body.anthropicWorkspaceId === "string") next.anthropicWorkspaceId = body.anthropicWorkspaceId.trim();
    if (Array.isArray(body.models)) next.models = body.models.filter((m) => typeof m === "string" && m);
    const switched = previous.kind !== active.kind || previous.preset?.id !== active.preset?.id;
    if (switched) {
      if (previous.preset) previous.preset.model ||= next.model;
      else if (previous.kind !== "custom" && previous.kind !== "codex") next.officialModels[previous.kind] ||= next.model;
    }
    if (switched || typeof body.model === "string" || official?.provider === active.kind) {
      setActiveModel(next, typeof body.model === "string" ? body.model : configuredModel(next) || next.model);
    }
    for (const k of ["codexEnabled", "claudeEnabled", "quietThink", "showStatusBar", "mute"]) {
      if (body[k] !== undefined) next[k] = !!body[k];
    }
    if (body.defaultHand === "codex" || body.defaultHand === "claude") next.defaultHand = body.defaultHand;
    if (body.tools && typeof body.tools === "object") next.tools = body.tools;
    return next;
  });
}

function checkUrl(url) {
  const text = String(url || "").trim();
  let parsed;
  try { parsed = new URL(text); } catch {}
  if (!parsed || !/^https?:\/\//i.test(text) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("请输入 HTTP 或 HTTPS 接口地址，地址不能含有账号、参数或片段");
  }
  return normBase(parsed.href);
}

/** 旧客户端默认设为当前，新设置页显式保存或切换。 */
export async function createPreset({ name, url, apiKey, model, thinking, activate = true }) {
  return updateConfig((raw) => {
    if (raw.presets.length >= MAX_PRESETS) throw new Error(`最多保存 ${MAX_PRESETS} 个连接`);
    const preset = {
      id: presetId(),
      name: String(name || "").trim().slice(0, 40) || "未命名连接",
      url: checkUrl(url),
      apiKey: String(apiKey || "").trim(),
      ...(model !== undefined ? { model: draftModel(model) } : {}),
      ...(thinking !== undefined ? { thinking: normThinking(thinking) } : {}),
    };
    if (activate) {
      setActiveModel(raw, raw.model);
      raw.activePresetId = preset.id;
      raw.apiMode = "custom";
    }
    raw.presets.push(preset);
    if (activate && preset.model) setActiveModel(raw, preset.model);
    return raw;
  });
}

/** 修改预设；apiKey 不传表示不改 */
export async function updatePreset(id, patch) {
  return updateConfig((raw) => {
    const preset = raw.presets.find((item) => item.id === id);
    if (!preset) throw new Error("连接不存在");
    if (typeof patch.name === "string") preset.name = patch.name.trim().slice(0, 40) || preset.name;
    if (typeof patch.url === "string") {
      const url = checkUrl(patch.url);
      if (url !== normBase(preset.url)) preset.apiKey = "";
      preset.url = url;
    }
    if (typeof patch.apiKey === "string") preset.apiKey = patch.apiKey.trim();
    if (patch.model !== undefined) preset.model = draftModel(patch.model);
    if (patch.thinking !== undefined) preset.thinking = normThinking(patch.thinking, preset.thinking);
    if (patch.activate === true && activeUpstream(raw).preset !== preset) {
      if (!preset.model) throw new Error("请先设置默认聊天模型");
      setActiveModel(raw, raw.model);
      raw.activePresetId = preset.id;
      raw.apiMode = "custom";
    }
    if (preset.model && activeUpstream(raw).preset === preset) setActiveModel(raw, preset.model);
    return raw;
  });
}

/** 删除预设；删掉的是当前预设时自动切到剩下的第一个 */
export async function deletePreset(id) {
  return updateConfig((raw) => {
    if (!raw.presets.some((p) => p.id === id)) throw new Error("连接不存在");
    raw.presets = raw.presets.filter((p) => p.id !== id);
    if (raw.activePresetId === id) {
      raw.activePresetId = raw.presets[0]?.id || "";
      if (raw.apiMode === "custom" && configuredModel(raw)) setActiveModel(raw, configuredModel(raw));
    }
    return raw;
  });
}

/** 只在草稿仍使用同一个地址时使用该连接的已存 Key。 */
export async function chatModelUpstream({ provider, presetId, url, apiKey, anthropicWorkspaceId }) {
  const raw = await getRawConfig();
  if (OFFICIAL_PROVIDERS.includes(provider)) {
    return {
      provider,
      proxyUrl: OFFICIAL_BASES[provider],
      apiKey: typeof apiKey === "string" ? apiKey.trim() : raw.officialKeys[provider] || "",
      anthropicWorkspaceId: typeof anthropicWorkspaceId === "string" ? anthropicWorkspaceId.trim() : raw.anthropicWorkspaceId,
    };
  }
  if (provider !== "custom") throw new Error("未知的聊天服务");
  const preset = raw.presets.find((item) => item.id === presetId);
  const proxyUrl = checkUrl(url);
  return {
    provider,
    proxyUrl,
    apiKey: typeof apiKey === "string" ? apiKey.trim() : proxyUrl === normBase(preset?.url) ? preset?.apiKey || "" : "",
  };
}

/** 构造上游请求的认证头：统一 Bearer；Anthropic 未限定 workspace 的 Key 需额外带 anthropic-workspace-id */
export function authHeaders(cfg) {
  const h = { Authorization: `Bearer ${cfg.apiKey}` };
  if (cfg.provider === "anthropic" && cfg.anthropicWorkspaceId) {
    h["anthropic-workspace-id"] = cfg.anthropicWorkspaceId;
  }
  return h;
}

export function maskKey(key) {
  if (!key) return "";
  return key.length > 7 ? `${key.slice(0, 3)}****${key.slice(-4)}` : "****";
}

function memoryManagement(upstream, env = process.env) {
  const localSereinBase = "http://127.0.0.1:18217/v1";
  const trustedBase = normBase(env.ECHO_SEREIN_API_BASE);
  const matchesSerein = upstream.preset?.name.trim().toLowerCase() === "serein" &&
    (upstream.proxyUrl === localSereinBase || (trustedBase && upstream.proxyUrl === trustedBase));
  if (!matchesSerein) return { memoryOwner: "echo" };
  let settingsUrl;
  try { settingsUrl = new URL(env.ECHO_SEREIN_SETTINGS_URL); } catch {}
  return {
    memoryOwner: "serein",
    sereinSettingsUrl: settingsUrl?.protocol === "https:" && !settingsUrl.username && !settingsUrl.password && !settingsUrl.search
      ? settingsUrl.href
      : undefined,
  };
}

/** 供前端读取的脱敏配置：不回传任何 Key 明文 */
export function publicConfig(raw) {
  const up = activeUpstream(raw);
  const { officialKeys, presets, ...rest } = raw;
  const codex = normCodex(raw.codex);
  // Codex 模式下，聊天页顶部显示的是 Codex 的模型
  if (up.kind === "codex") Object.assign(rest, { model: codex.model || "Codex 默认模型", models: [codex.model || "Codex 默认模型"] });
  delete rest.apiKey;
  delete rest.proxyUrl;
  delete rest.voice; // 语音 Key 只经 publicVoice() 脱敏后返回
  return {
    ...rest,
    provider: OFFICIAL_PROVIDERS.includes(raw.provider) ? raw.provider : "openai",
    proxyUrl: up.proxyUrl,
    officialBases: OFFICIAL_BASES,
    officialKeyMasks: Object.fromEntries(OFFICIAL_PROVIDERS.map((p) => [p, maskKey(officialKeys?.[p])])),
    presets: presets.map((p) => ({
      id: p.id, name: p.name, url: p.url, hasKey: !!p.apiKey, keyMask: maskKey(p.apiKey),
      model: p === up.preset ? raw.model : p.model || "",
      thinking: { ...DEFAULT_THINKING, ...(p.thinking || {}) },
    })),
    officialThinking: Object.fromEntries(OFFICIAL_PROVIDERS.map((p) => [p, { ...DEFAULT_THINKING, ...(raw.officialThinking?.[p] || {}) }])),
    codex,
    voice: publicVoice(normVoice(raw.voice)),
    timeouts: normTimeouts(raw.timeouts, undefined, { lenient: true }),
    defaultTimeouts: DEFAULT_TIMEOUTS,
    hasKey: up.kind === "codex" || !!up.apiKey,
    apiKeyMask: maskKey(up.apiKey),
    thoughtTranslationReady: Boolean(process.env.ECHO_CF_ACCOUNT_ID && process.env.ECHO_CF_TRANSLATE_TOKEN),
    ...memoryManagement(up),
  };
}
