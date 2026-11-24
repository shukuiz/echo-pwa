// 后端配置读写：API Key / 接口地址只存后端 settings，绝不进前端代码、不进 Git、不打印日志
import { randomBytes } from "node:crypto";
import { paths, readJSON, writeJSON, DATA_DIR } from "./storage.js";

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
  apiMode: "official", // official | custom
  provider: "openai", // 官方模式下的厂商：openai | deepseek | anthropic
  officialKeys: {}, // { openai: "sk-…", deepseek: "…", anthropic: "…" } 各官方 Key 分开保存，切换不丢
  presets: [], // 自定义预设：[{ id, name, url, apiKey }]
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
  const official = OFFICIAL_BASES[raw.provider];
  if (!legacyUrl || (official && normBase(official) === legacyUrl)) {
    next.apiMode = "official";
    next.provider = official ? raw.provider : "openai";
    next.officialKeys = legacyKey ? { [next.provider]: legacyKey } : {};
  } else {
    const id = presetId();
    next.apiMode = "custom";
    next.provider = OFFICIAL_BASES[raw.provider] ? raw.provider : "openai";
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
  return { ...DEFAULT_CONFIG, ...migrate(raw) };
}

/** 当前生效的上游：官方厂商或选中的自定义预设 */
export function activeUpstream(raw) {
  if (raw.apiMode === "custom") {
    const preset = raw.presets.find((p) => p.id === raw.activePresetId);
    return { kind: "custom", preset, proxyUrl: preset ? normBase(preset.url) : "", apiKey: preset?.apiKey || "" };
  }
  const provider = OFFICIAL_BASES[raw.provider] ? raw.provider : "openai";
  return { kind: provider, proxyUrl: OFFICIAL_BASES[provider], apiKey: raw.officialKeys?.[provider] || "" };
}

/** 读取完整配置：附带当前生效的 provider / proxyUrl / apiKey，供聊天与模型请求使用 */
export async function getConfig() {
  const raw = await getRawConfig();
  const up = activeUpstream(raw);
  return { ...raw, provider: up.kind, proxyUrl: up.proxyUrl, apiKey: up.apiKey };
}

/** 合并写入原始配置 */
export async function saveRawConfig(next) {
  const clean = { ...next };
  delete clean.apiKey;
  delete clean.proxyUrl;
  await writeJSON(paths.config(DATA_DIR), clean);
  return clean;
}

/** 处理设置页的修改；返回新原始配置。抛出带 message 的错误表示参数不合法 */
export async function applySettingsPatch(body) {
  const raw = await getRawConfig();
  const next = { ...raw, officialKeys: { ...raw.officialKeys }, presets: raw.presets.map((p) => ({ ...p })) };

  if (body.apiMode === "official" || body.apiMode === "custom") next.apiMode = body.apiMode;
  if (typeof body.provider === "string" && OFFICIAL_BASES[body.provider]) next.provider = body.provider;
  if (typeof body.activePresetId === "string") {
    if (body.activePresetId && !next.presets.some((p) => p.id === body.activePresetId)) throw new Error("预设不存在");
    next.activePresetId = body.activePresetId;
  }

  // 保存 Key：写到当前生效的官方厂商，或当前选中的预设
  if (typeof body.apiKey === "string") {
    const key = body.apiKey.trim();
    if (next.apiMode === "custom") {
      const p = next.presets.find((x) => x.id === next.activePresetId);
      if (!p) throw new Error("请先新建或选择一个自定义预设");
      p.apiKey = key;
    } else {
      next.officialKeys[next.provider] = key;
    }
  }

  if (typeof body.anthropicWorkspaceId === "string") next.anthropicWorkspaceId = body.anthropicWorkspaceId.trim();
  if (typeof body.model === "string") next.model = body.model;
  if (Array.isArray(body.models)) next.models = body.models.filter((m) => typeof m === "string" && m);
  for (const k of ["codexEnabled", "claudeEnabled", "quietThink", "showStatusBar", "mute"]) {
    if (body[k] !== undefined) next[k] = !!body[k];
  }
  if (body.defaultHand === "codex" || body.defaultHand === "claude") next.defaultHand = body.defaultHand;
  if (body.tools && typeof body.tools === "object") next.tools = body.tools;

  return saveRawConfig(next);
}

function checkUrl(url) {
  const u = normBase(url);
  if (!/^https?:\/\/[^\s/]+/i.test(u)) throw new Error("接口地址需以 http(s):// 开头");
  return u;
}

/** 新建自定义预设并设为当前 */
export async function createPreset({ name, url, apiKey }) {
  const raw = await getRawConfig();
  if (raw.presets.length >= MAX_PRESETS) throw new Error(`最多保存 ${MAX_PRESETS} 个预设`);
  const p = {
    id: presetId(),
    name: String(name || "").trim().slice(0, 40) || "未命名预设",
    url: checkUrl(url),
    apiKey: String(apiKey || "").trim(),
  };
  return saveRawConfig({ ...raw, presets: [...raw.presets, p], activePresetId: p.id, apiMode: "custom" });
}

/** 修改预设；apiKey 不传表示不改 */
export async function updatePreset(id, patch) {
  const raw = await getRawConfig();
  const presets = raw.presets.map((p) => ({ ...p }));
  const p = presets.find((x) => x.id === id);
  if (!p) throw new Error("预设不存在");
  if (typeof patch.name === "string") p.name = patch.name.trim().slice(0, 40) || p.name;
  if (typeof patch.url === "string") p.url = checkUrl(patch.url);
  if (typeof patch.apiKey === "string") p.apiKey = patch.apiKey.trim();
  return saveRawConfig({ ...raw, presets });
}

/** 删除预设；删掉的是当前预设时自动切到剩下的第一个 */
export async function deletePreset(id) {
  const raw = await getRawConfig();
  if (!raw.presets.some((p) => p.id === id)) throw new Error("预设不存在");
  const presets = raw.presets.filter((p) => p.id !== id);
  const activePresetId = raw.activePresetId === id ? presets[0]?.id || "" : raw.activePresetId;
  return saveRawConfig({ ...raw, presets, activePresetId });
}

/** 构造上游请求的认证头：统一 Bearer；Anthropic 未限定 workspace 的 Key 需额外带 anthropic-workspace-id */
export function authHeaders(cfg) {
  const h = { Authorization: `Bearer ${cfg.apiKey}` };
  if (cfg.provider === "anthropic" && cfg.anthropicWorkspaceId) {
    h["anthropic-workspace-id"] = cfg.anthropicWorkspaceId;
  }
  return h;
}

const maskKey = (k) => (k ? `${String(k).slice(0, 3)}****${String(k).slice(-4)}` : "");

/** 供前端读取的脱敏配置：不回传任何 Key 明文 */
export function publicConfig(raw) {
  const up = activeUpstream(raw);
  const { officialKeys, presets, ...rest } = raw;
  delete rest.apiKey;
  delete rest.proxyUrl;
  return {
    ...rest,
    provider: OFFICIAL_BASES[raw.provider] ? raw.provider : "openai",
    proxyUrl: up.proxyUrl,
    officialBases: OFFICIAL_BASES,
    officialKeyMasks: Object.fromEntries(OFFICIAL_PROVIDERS.map((p) => [p, maskKey(officialKeys?.[p])])),
    presets: presets.map((p) => ({ id: p.id, name: p.name, url: p.url, hasKey: !!p.apiKey, keyMask: maskKey(p.apiKey) })),
    hasKey: !!up.apiKey,
    apiKeyMask: maskKey(up.apiKey),
  };
}
