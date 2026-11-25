// The server selects the repository, branch and file. Clients can only edit AGENTS.md.
export default async function projectRoute(app) {
  const repo = process.env.ECHO_PROJECT_REPO || "shukuiz/echo-pwa";
  const branch = process.env.ECHO_PROJECT_BRANCH || "feat/echo-memory-rerank-api";
  const token = process.env.ECHO_PROJECT_TOKEN;
  const url = "https://api.github.com/repos/" + repo + "/contents/AGENTS.md";
  async function request(method, body) {
    const res = await fetch(url + (method === "GET" ? "?ref=" + encodeURIComponent(branch) : ""), {
      method, headers: { Accept: "application/vnd.github+json", ...(token && {Authorization: "Bearer " + token}) },
      redirect: "error", signal: AbortSignal.timeout(12000), body: body && JSON.stringify(body),
    });
    if (!res.ok) throw Object.assign(new Error(res.status === 409 || res.status === 422 ?
      "文件已变动，请重新读取后再保存" : "无法访问项目说明，请检查仓库和权限"), {statusCode: [409,422].includes(res.status) ? 409 : 502});
    return res.json();
  }
  app.get("/api/project/instructions", async () => {
    const file = await request("GET");
    return {repo, branch, text: Buffer.from(file.content, "base64").toString(), version: file.sha, writable: Boolean(token && process.env.ECHO_AUTH_PASSWORD)};
  });
  app.put("/api/project/instructions", async (req, reply) => {
    if (!token || !process.env.ECHO_AUTH_PASSWORD) return reply.code(403).send({message:"项目说明尚未开启写入"});
    const {text, version} = req.body || {};
    if (typeof text !== "string" || !text.trim() || Buffer.byteLength(text)>200000 || !/^[0-9a-f]{40}$/.test(version)) return reply.code(400).send({message:"说明内容或版本无效"});
    const saved = await request("PUT", {branch, sha:version, content:Buffer.from(text).toString("base64"), message:"Update shared project instructions from Echo"});
    return {version:saved.content.sha, commit:saved.commit.sha};
  });
}
