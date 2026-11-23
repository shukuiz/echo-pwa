// 后端配置读写：API Key / 代理地址只存后端 settings，绝不进前端代码、不进 Git、不打印日志
import { paths, readJSON, writeJSON, DATA_DIR } from "./storage.js";

const DEFAULT_CONFIG = {
  apiKey: "",
  proxyUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  models: ["gpt-4o-mini", "gpt-4o", "deepseek-chat"],
  codexEnabled: true,
  claudeEnabled: true,
  defaultHand: "claude",
  quietThink: true,
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

/** 供前端读取的脱敏配置：不回传 Key 明文，只回掩码与是否存在 */
export function publicConfig(cfg) {
  const { apiKey, ...rest } = cfg;
  const mask = apiKey ? `${String(apiKey).slice(0, 3)}****${String(apiKey).slice(-4)}` : "";
  return { ...rest, hasKey: !!apiKey, apiKeyMask: mask };
}
