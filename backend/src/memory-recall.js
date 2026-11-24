import { readMemoryModels } from "./memory-model-config.js";

const EMBEDDING_BATCH_SIZE = 16;
const MAX_CACHED_VECTORS = 1024;
const MAX_CANDIDATES = 20;
const MIN_COSINE = 0.5;
const MAX_DOCUMENT_CHARS = 1200;

export class MemoryRecallError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function postModel(config, body, signal) {
  const headers = { "Content-Type": "application/json" };
  if (config.key) headers.Authorization = `Bearer ${config.key}`;
  const res = await fetch(config.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: config.model, ...body }),
    redirect: "error",
    signal,
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error("Model request failed");
  }
  return res.json();
}

function unitVector(values) {
  if (!Array.isArray(values) || !values.length || values.length > 16384 || !values.every(Number.isFinite)) {
    throw new Error("Invalid embedding vector");
  }
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm === 0) throw new Error("Invalid embedding magnitude");
  return Float32Array.from(values, (value) => value / norm);
}

function indexedResults(rows, count, transform) {
  if (!Array.isArray(rows) || rows.length !== count) throw new Error("Incomplete model results");
  const results = new Map();
  for (const row of rows) {
    const index = row?.index;
    if (!Number.isInteger(index) || index < 0 || index >= count || results.has(index)) {
      throw new Error("Invalid model result index");
    }
    results.set(index, transform(row));
  }
  return results;
}

async function embed(config, texts, signal) {
  const payload = await postModel(config, { input: texts, encoding_format: "float" }, signal);
  const vectors = indexedResults(payload?.data, texts.length, (row) => unitVector(row.embedding));
  return texts.map((_, index) => vectors.get(index));
}

async function rerank(config, query, documents, signal) {
  const payload = await postModel(config, {
    query,
    documents,
    top_n: documents.length,
    return_documents: false,
  }, signal);
  return indexedResults(payload?.results, documents.length, ({ relevance_score: score }) => {
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error("Invalid relevance score");
    return score;
  });
}

export async function testMemoryModel(kind, config) {
  if (!config) return { ok: false, message: "请先保存接口地址和模型名" };
  const signal = AbortSignal.timeout(8_000);
  const question = "这是一条连接测试。";
  try {
    if (kind === "embedding") await embed(config, [question], signal);
    else await rerank(config, question, ["用于验证重排接口的示例。"], signal);
    return { ok: true, message: "连接成功" };
  } catch {
    return { ok: false, message: signal.aborted ? "连接超时" : "连接失败，请核对接口地址、模型名和 API Key" };
  }
}

function documentFor(item) {
  if (!item?.id || !["text", "summary"].includes(item.tab) || typeof item.text !== "string" || !item.text.trim()) return null;
  const title = typeof item.title === "string" ? item.title.trim().slice(0, 160) : "";
  return `${title}\n${item.text.trim()}`.trim().slice(0, MAX_DOCUMENT_CHARS);
}

function cosine(left, right) {
  let score = 0;
  for (let i = 0; i < left.length; i++) score += left[i] * right[i];
  return score;
}

function stageError(signal, code, label) {
  return signal.aborted
    ? new MemoryRecallError(504, "memory_recall_timeout", "记忆召回超时")
    : new MemoryRecallError(502, code, `${label}请求失败或返回格式无效`);
}

export function createMemoryRecall(load, env = process.env) {
  const threshold = Number(env.ECHO_RERANK_MIN_SCORE?.trim() || 0.65);
  let cachedProfile;
  let vectorCache;

  return async function recall(query, limit) {
    const { embedding, rerank: reranker } = await readMemoryModels(env);
    if (!embedding || !reranker || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new MemoryRecallError(503, "memory_recall_unconfigured", "请在「设置 → 记忆模型」配置向量和重排模型");
    }
    const profile = JSON.stringify([embedding.url, embedding.model, embedding.key]);
    if (cachedProfile !== profile) {
      cachedProfile = profile;
      vectorCache = new Map();
    }
    const cache = vectorCache;
    const source = await load();
    const documents = (source.memory || []).flatMap((item) => {
      const text = documentFor(item);
      return text ? [{ id: item.id, text }] : [];
    });
    const activeIds = new Set(documents.map(({ id }) => id));
    for (const id of cache.keys()) if (!activeIds.has(id)) cache.delete(id);
    if (!documents.length) return [];

    const signal = AbortSignal.timeout(20_000);
    const candidates = [];
    try {
      const [queryVector] = await embed(embedding, [query], signal);
      for (let offset = 0; offset < documents.length; offset += EMBEDDING_BATCH_SIZE) {
        const batch = documents.slice(offset, offset + EMBEDDING_BATCH_SIZE);
        const entries = new Map();
        const missing = batch.filter(({ id, text }) => {
          const saved = cache.get(id);
          if (!saved || saved.text !== text || saved.vector.length !== queryVector.length) return true;
          entries.set(id, saved);
          return false;
        });
        if (missing.length) {
          const vectors = await embed(embedding, missing.map(({ text }) => text), signal);
          if (vectors.some((vector) => vector.length !== queryVector.length)) throw new Error("Embedding dimensions differ");
          missing.forEach(({ id, text }, index) => {
            const entry = { text, vector: vectors[index] };
            entries.set(id, entry);
            cache.set(id, entry);
            if (cache.size > MAX_CACHED_VECTORS) cache.delete(cache.keys().next().value);
          });
        }
        for (const doc of batch) {
          const entry = entries.get(doc.id);
          const similarity = cosine(queryVector, entry.vector);
          if (similarity >= MIN_COSINE) candidates.push({ ...doc, similarity });
        }
      }
    } catch {
      throw stageError(signal, "memory_embedding_failed", "记忆向量");
    }

    const shortlist = candidates.sort((a, b) => b.similarity - a.similarity).slice(0, MAX_CANDIDATES);
    if (!shortlist.length) return [];
    let scores;
    try {
      scores = await rerank(reranker, query, shortlist.map(({ text }) => text), signal);
    } catch {
      throw stageError(signal, "memory_rerank_failed", "记忆重排");
    }

    // Recheck the store after network calls so edits and deletes cannot expose stale results.
    const latest = await load();
    const current = new Map((latest.memory || []).filter(Boolean).map((item) => [item.id, item]));
    return shortlist.flatMap((doc, index) => {
      const score = scores.get(index);
      const item = current.get(doc.id);
      if (score < threshold || documentFor(item) !== doc.text) return [];
      return [{ id: item.id, tab: item.tab, title: item.title ?? "", text: item.text, score }];
    }).sort((a, b) => b.score - a.score).slice(0, limit);
  };
}
