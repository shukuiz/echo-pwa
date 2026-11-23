// 后端配置读写：API Key / 代理地址只存后端 settings，绝不进前端代码、不进 Git、不打印日志
import { paths, readJSON, writeJSON, DATA_DIR } from "./storage.js";

// 官方接口地址：接口类型选了官方后，proxyUrl 自动落到这里，用户仍可改回自定义
// Anthropic 走官方 OpenAI 兼容层（https://api.anthropic.com/v1/），复用同一套 /chat/completions 转发
export const OFFICIAL_BASES = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

const DEFAULT_CONFIG = {
  apiKey: "",
  provider: "openai", // openai | deepseek | anthropic | custom
  proxyUrl: "https://api.openai.com/v1",
  anthropicWorkspaceId: "", // 可选：未限定 workspace 的 Claude 个人/服务账户 Key 需要带 anthropic-workspace-id
  model: "gpt-4o-mini",
  models: ["gpt-4o-mini", "gpt-4o", "deepseek-chat"],
  codexEnabled: true,
  claudeEnabled: true,
  defaultHand: "claude",
  quietThink: true,
  showStatusBar: true,
  mute: false,
  tools: { translate: true, media: true, worldbook: true, miniapp: true, script: true },
};

/** 读取完整配置（含 Key，仅后端内部使用） */
export async function getConfig() {
  const cfg = await readJSON(paths.config(DATA_DIR), {});
  return { ...DEFAULT_CONFIG, ...cfg };
}

/** 合并写入配置；apiKey 传 undefined 表示不改动 */
export async function saveConfig(patch) {
  const cur = await getConfig();
  const next = { ...cur, ...patch };
  if (patch.apiKey === undefined) next.apiKey = cur.apiKey;
  await writeJSON(paths.config(DATA_DIR), next);
  return next;
}

/** 构造上游请求的认证头：统一 Bearer；Anthropic 未限定 workspace 的 Key 需额外带 anthropic-workspace-id */
export function authHeaders(cfg) {
  const h = { Authorization: `Bearer ${cfg.apiKey}` };
  if (cfg.provider === "anthropic" && cfg.anthropicWorkspaceId) {
    h["anthropic-workspace-id"] = cfg.anthropicWorkspaceId;
  }
  return h;
}

/** 供前端读取的脱敏配置：不回传 Key 明文，只回掩码与是否存在 */
export function publicConfig(cfg) {
  const { apiKey, ...rest } = cfg;
  const mask = apiKey ? `${String(apiKey).slice(0, 3)}****${String(apiKey).slice(-4)}` : "";
  // 接口类型与地址一致性：官方类型但地址已被改成别处时，前端显示为「自定义」
  const official = OFFICIAL_BASES[cfg.provider];
  const base = String(cfg.proxyUrl || "").replace(/\/+$/, "");
  const provider = cfg.provider && official && String(official).replace(/\/+$/, "") === base ? cfg.provider : "custom";
  return { ...rest, provider, hasKey: !!apiKey, apiKeyMask: mask };
}
