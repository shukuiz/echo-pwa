import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, paths } from "./storage.js";

const prefixes = { embedding: "ECHO_EMBEDDING", rerank: "ECHO_RERANK" };
const file = path.join(paths.settings(DATA_DIR), "memory-models.json");
let writes = Promise.resolve();

export function isMemoryModelKind(kind) {
  return kind === "embedding" || kind === "rerank";
}

function normalizeUrl(value) {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.hash || url.search) {
    throw new Error("Invalid model endpoint");
  }
  return url.href;
}

async function readOverrides() {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error("无法读取记忆模型设置");
  }
}

function effectiveProvider(saved, kind, env) {
  const prefix = prefixes[kind];
  const value = saved[kind] ?? {
    url: env[`${prefix}_URL`]?.trim(),
    model: env[`${prefix}_MODEL`]?.trim(),
    key: env[`${prefix}_API_KEY`]?.trim(),
  };
  try {
    if (!value.model) return null;
    return { ...value, url: normalizeUrl(value.url) };
  } catch {
    return null;
  }
}

export async function readMemoryModels(env = process.env) {
  const overrides = await readOverrides();
  return {
    embedding: effectiveProvider(overrides, "embedding", env),
    rerank: effectiveProvider(overrides, "rerank", env),
  };
}

export function publicMemoryModels(models) {
  return Object.fromEntries(Object.entries(models).map(([kind, config]) => [
    kind, { url: config?.url ?? "", model: config?.model ?? "", hasKey: Boolean(config?.key) },
  ]));
}

export async function saveMemoryModel(kind, body, env = process.env) {
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!model || model.length > 200) throw new RangeError("请输入 1–200 个字符的模型名称");
  let url;
  try {
    if (typeof body.url !== "string" || body.url.length > 2048) throw new Error();
    url = normalizeUrl(body.url.trim());
  } catch {
    throw new RangeError("请输入完整的 HTTPS 模型端点，或使用本机 HTTP 地址");
  }
  const key = body.apiKey;
  if (key !== undefined && (typeof key !== "string" || key.length > 4096 || /[\r\n]/.test(key))) {
    throw new RangeError("API Key 格式不正确");
  }
  const operation = writes.then(async () => {
    const overrides = await readOverrides();
    const previous = effectiveProvider(overrides, kind, env);
    // Retain an omitted key only for the exact same provider endpoint.
    overrides[kind] = { url, model, key: key?.trim() ?? (previous?.url === url ? previous.key || "" : "") };
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = file + ".tmp";
    await writeFile(temporary, JSON.stringify(overrides, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
    return publicMemoryModels({
      embedding: effectiveProvider(overrides, "embedding", env),
      rerank: effectiveProvider(overrides, "rerank", env),
    });
  });
  writes = operation.catch(() => {});
  return operation;
}
