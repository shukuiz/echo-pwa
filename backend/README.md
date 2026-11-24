# echo 后端（P0）

## 带登录保护的部署

有公网入口的部署应先启用登录保护。后端配置写入服务自己的 `.env`，不要提交文件。将 `ECHO_HOST` 设为 `127.0.0.1`，把 `ECHO_AUTH_ORIGIN` 设为用户打开 Echo 的 HTTPS 来源（只含协议和主机，不要末尾斜杠），并为 `ECHO_AUTH_PASSWORD` 设置单独生成的至少 20 个字符的密码。Node.js 22 可用 `node --env-file=.env server.js` 加载该文件。

构建前端时设 `NEXT_PUBLIC_ECHO_AUTH=1`。前端托管配置把同源的 `/api/*` 转发到后端 HTTPS 入口，保留路径、Cookie、Set-Cookie 和浏览器 Origin。登录密码与模型 API Key 应分别配置。启用登录时，旧版的跨域直连关闭，私有 API 不缓存，后端重启会要求重新登录。

轻量后端，适配 4 GiB 内存的 Altare 常开。提供四个接口：聊天转发、记忆读写、文件读写、工具调用（预留）。数据全部落盘为纯文本/JSON，无数据库。

## 目录结构

```
backend/
  server.js              入口（Fastify，零重型依赖）
  src/
    storage.js           数据目录初始化 + 文件读写工具（DATA_DIR 单点定义）
    config.js            配置读写（Key 只存后端）
    prompt.js            System Prompt 拼接
    routes/
      chat.js           聊天流式转发
      memory.js         记忆 + 提醒读写
      files.js          文件读写
      tools.js          工具调用（预留）
      settings.js       设置读写 + 测试连接
  data/                  数据根目录（首次启动自动生成）
    AGENTS.md           说明书（给 Codex）
    CLAUDE.md           说明书（给 Claude Code，内容同步）
    memory/
      about-you.md      你的喜好/习惯
      about-us.md       你们聊过的大事/约定
      today.md          今天发生了什么
      diary/            每日总结（按日期）
      files/            预设/世界书/小应用 + index.json
      settings/config.json   API Key / 代理地址（唯一 Key 存放处）
      store.json        结构化记忆 + 提醒
      chat.json         聊天记录
```

## 启动

```bash
cd backend
npm install
npm start          # 默认监听 0.0.0.0:8787
```

环境变量（可选）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `ECHO_PORT` | `8787` | 后端端口 |
| `ECHO_HOST` | `0.0.0.0` | 监听地址 |
| `ECHO_DATA_DIR` | `backend/data` | 数据目录 |

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET/POST | `/api/chat` | 聊天历史 / 流式聊天 |
| GET/POST/PUT/DELETE | `/api/memory` | 记忆读写（`/api/memory/:id` 改/删）|
| POST | `/api/memory/recall` | 先按向量筛选，再对记忆候选重排 |
| GET/POST/DELETE | `/api/files` | 文件读写（`/api/files/:id` 读/删）|
| GET/POST | `/api/tools` | 工具调用（P1 接入 MCP，现为占位）|
| GET/PUT | `/api/settings` | 设置读写（Key 脱敏返回）|
| POST | `/api/settings/test` | 测试连接 |

## 记忆向量召回与重排

在 Echo 的「设置 → 记忆模型」分别填写向量和重排模型的完整接口地址、模型名及可选 API Key。保存立即生效，每个模型都可以独立测试。测试发送固定示例文案。刷新页面后，API Key 只显示已配置状态。更换端点时，原端点的 Key 不会随地址迁移。地址支持 HTTPS 或本机 HTTP。

已有服务端环境配置也可继续使用。设置页第一次保存某个模型后，已保存的配置优先。

| 变量 | 用途 |
|---|---|
| `ECHO_EMBEDDING_URL` | 向量端点，例如 `https://embedding.example/v1/embeddings` |
| `ECHO_EMBEDDING_MODEL` | 端点支持的向量模型名 |
| `ECHO_EMBEDDING_API_KEY` | 端点要求鉴权时设置 |
| `ECHO_RERANK_URL` | 重排端点，例如 `https://reranker.example/v1/rerank` |
| `ECHO_RERANK_MODEL` | 端点支持的重排模型名 |
| `ECHO_RERANK_API_KEY` | 端点要求鉴权时设置 |
| `ECHO_RERANK_MIN_SCORE` | 重排最低相关分，范围 0–1，默认 0.65 |

向量端点接收 OpenAI 格式的批量文本，返回 `data[].index` 与 `data[].embedding`。重排端点接收 `query`、`documents`、`top_n` 和 `return_documents: false`，每条候选都要返回 `results[].index` 与范围 0–1 的 `results[].relevance_score`。启用前确认配置的服务可以接收你的记忆查询和记忆文本片段。

请求体示例为 `{"query":"备用钥匙放哪了？","limit":2}`，返回 `{"results":[{"id":"…","tab":"text","title":"…","text":"…","score":0.96}]}`，结果按重排分数降序。查询限 1000 字符，`limit` 默认 2，范围 1–20。启用 Echo 登录时，需使用已有会话 Cookie 和受信任的 Origin。

接口只检索记忆本中的文字记忆和总结。每条最多取 1200 字符用于模型调用，最多送 20 条向量候选去重排。进程内按内容缓存文档向量，新增或编辑后按需生成，删除后从结果消失。没有达标内容时返回空列表。模型未配置、请求失败或超时分别返回 503、502 或 504。调用这个接口只返回查询结果，自动带入聊天需由调用方接入。

## Key 安全

- 聊天模型 Key 存在 `data/memory/settings/config.json`。设置页保存的向量和重排 Key 存在同目录的 `memory-models.json`。这些凭据文件均由 Git 忽略。
- 后端不打印请求日志、不打印 Key；`GET /api/settings` 只回脱敏掩码。
- 前端拿到的是掩码，明文 Key 只由后端使用。
- 导出备份（前端「记忆本 → 导出」）不含 settings，天然不携带 Key。

## 前端如何连后端

前端 `lib/api.ts` 的默认后端地址为 `http://localhost:8787`，可通过 `NEXT_PUBLIC_ECHO_API` 覆盖：

```bash
# 与后端同机部署时：
NEXT_PUBLIC_ECHO_API=http://127.0.0.1:8787 npm run build

# 手机浏览器访问 Altare 时，填 Altare 的公网/内网地址：
NEXT_PUBLIC_ECHO_API=http://<altare-ip>:8787
```

## P0 验收

1. 后端跑起来，手机浏览器能打开小手机。
2. 设置页填 Key（或本地代理地址）后能真聊天，流式逐字、可停止、可重试。
3. 改一条记忆，下一条回复就用上。
4. 刷新/重启后端，聊天记录与记忆不丢，可导出备份。
