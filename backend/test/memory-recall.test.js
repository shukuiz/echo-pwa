import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Fastify from "fastify";
import { installAuth } from "../src/auth.js";

const origin = "https://echo.example";
const password = "local-test-password-only";
const query = "备用钥匙放哪了？";
let app, upstream, directory, storage, headers, mode, requests;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "echo-recall-"));
  process.env.ECHO_DATA_DIR = directory;
  storage = await import("../src/storage.js");
  const { default: memoryRoute } = await import("../src/routes/memory.js");
  const { default: settingsRoute } = await import("../src/routes/settings.js");
  upstream = Fastify();
  upstream.post("/v1/embeddings", async ({ body, headers }) => {
    assert.equal(headers.authorization, "Bearer test-embed-key");
    assert.equal(body.model, "test-embed");
    assert.equal(body.encoding_format, "float");
    requests.push(body.input);
    const data = body.input.map((text, index) => ({
      index,
      embedding: text.includes("新位置") ? [0, 1] : text.includes("蓝色") ? [8, 6] : [1, 0],
    })).reverse();
    return { model: body.model, data };
  });
  upstream.post("/v1/rerank", async ({ body, headers }, reply) => {
    assert.equal(headers.authorization, "Bearer test-rerank-key");
    assert.equal(body.model, "test-rerank");
    assert.ok([query, "这是一条连接测试。"].includes(body.query));
    assert.equal(body.return_documents, false);
    assert.equal(body.top_n, body.documents.length);
    assert.ok(!body.documents.some((text) => /不相关|私人设定/.test(text)));
    if (mode === "error") return reply.code(500).send({ message: "provider secret text" });
    if (mode === "invalid") return { results: [{ index: 99, relevance_score: 0.99 }] };
    return { results: body.documents.map((text, index) => ({
      index, relevance_score: text.includes("蓝色") ? 0.96 : 0.60,
    })) };
  });
  const base = await upstream.listen({ host: "127.0.0.1", port: 0 });
  Object.assign(process.env, {
    ECHO_EMBEDDING_URL: `${base}/v1/embeddings`, ECHO_EMBEDDING_MODEL: "test-embed",
    ECHO_EMBEDDING_API_KEY: "test-embed-key", ECHO_RERANK_URL: `${base}/v1/rerank`,
    ECHO_RERANK_MODEL: "test-rerank", ECHO_RERANK_API_KEY: "test-rerank-key",
  });
  app = Fastify();
  installAuth(app, { ECHO_AUTH_ORIGIN: origin, ECHO_AUTH_PASSWORD: password });
  await app.register(memoryRoute);
  await app.register(settingsRoute);
  const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin }, payload: { password } });
  assert.equal(login.statusCode, 200);
  headers = { origin, cookie: login.headers["set-cookie"].split(";")[0] };
});

after(async () => {
  await app?.close();
  await upstream?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function seed() {
  mode = "success";
  requests = [];
  await storage.writeJSON(storage.paths.store(directory), { memory: [
    { id: "a", tab: "text", title: "钥匙", text: "这只是店里的展示钥匙" },
    { id: "b", tab: "text", title: "备用钥匙", text: "在蓝色茶叶罐里" },
    { id: "c", tab: "summary", text: "不相关的新位置" },
    { id: "d", tab: "persona", text: "私人设定" },
  ] });
}

function recall(payload = { query }, requestHeaders = headers) {
  return app.inject({ method: "POST", url: "/api/memory/recall", headers: requestHeaders, payload });
}

test("recall requires an Echo session and validates input before calling providers", async () => {
  await seed();
  assert.equal((await recall({ query }, { origin })).statusCode, 401);
  assert.equal((await recall({ query: " " })).statusCode, 400);
  assert.equal((await recall({ query, limit: 21 })).statusCode, 400);
  assert.equal(requests.length, 0);
});

test("vector recall feeds reranking and applies relevance threshold and limit", async () => {
  await seed();
  const response = await recall({ query, limit: 1 });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().results.map(({ id, score }) => ({ id, score })), [{ id: "b", score: 0.96 }]);
  assert.deepEqual((await recall()).json().results.map(({ id }) => id), ["b"]);
  assert.ok(requests.flat().every((text) => !text.includes("私人设定")));
});

test("edits and deletes take effect without manual reindexing", async () => {
  await seed();
  await recall();
  const edit = await app.inject({ method: "PUT", url: "/api/memory/b", headers, payload: { text: "现在放在新位置" } });
  assert.equal(edit.statusCode, 200);
  assert.deepEqual((await recall()).json().results, []);
  assert.ok(requests.flat().some((text) => text.includes("现在放在新位置")));
  await app.inject({ method: "DELETE", url: "/api/memory/a", headers });
  assert.deepEqual((await recall()).json().results, []);
});

test("failed or malformed reranking never falls back to vector results", async () => {
  await seed();
  for (const failure of ["error", "invalid"]) {
    mode = failure;
    const response = await recall();
    assert.equal(response.statusCode, 502, response.body);
    assert.equal(response.json().error, "memory_rerank_failed");
    assert.ok(!response.body.includes("provider secret text"));
  }
});

test("memory model settings save and test independently without leaking keys", async () => {
  await seed();
  const url = "/api/settings/memory-models";
  const base = upstream.listeningOrigin;
  const changed = await app.inject({
    method: "PUT", url: url + "/embedding", headers,
    payload: { url: base + "/v1/embeddings", model: "test-embed", apiKey: "test-embed-key" },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.deepEqual(changed.json().embedding, { url: base + "/v1/embeddings", model: "test-embed", hasKey: true });
  const keyLooks = await app.inject({ method: "GET", url, headers });
  assert.equal(keyLooks.statusCode, 200);
  assert.doesNotMatch(keyLooks.body, /test-embed-key|test-rerank-key/);
  const connectivity = await app.inject({ method: "POST", url: url + "/embedding/test", headers });
  assert.equal(connectivity.statusCode, 200, connectivity.body);
  assert.equal(connectivity.json().ok, true);
  const rerankTest = await app.inject({ method: "POST", url: url + "/rerank/test", headers });
  assert.equal(rerankTest.json().ok, true);
  assert.equal((await app.inject({ method: "POST", url: url + "/rerank/test", headers: { origin } })).statusCode, 401);
  assert.equal((await recall()).statusCode, 200);

  const edit = await app.inject({
    method: "PUT", url: url + "/embedding", headers,
    payload: { url: base + "/another-endpoint", model: "new-model" },
  });
  assert.equal(edit.statusCode, 200);
  assert.equal(edit.json().embedding.hasKey, false);
  assert.equal((await recall()).json().error, "memory_embedding_failed");
});
