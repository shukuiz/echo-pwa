# 记忆本 ↔ 记忆网关接口约定

记忆本前端（`components/memory/MemoryBook.tsx`）只通过 `lib/memory.ts` 读写数据，字段定义在 `lib/api.ts`
（`MemoryItem` / `MemoryExtra` / `RecallHit`），对齐 [Serein](https://github.com/Yinglianchun/Serein) 的概念：

| echo 前端 | Serein | 说明 |
|---|---|---|
| `kind: "scene"` | Scene | echo 主动想记住的片段、感受、约定（聊天里长按「记住」存成这一类） |
| `kind: "event"` | Event | 按聊天整理的「发生了什么」（旧数据 `tab: "summary"`） |
| `kind: "preference"` | 喜好 | `preference.subject`（user/ai/both）、`polarity`（like/dislike）、`keywords`（逐字命中浮现）、`reason` |
| `kind: "persona"` | — | echo 人设（旧数据 `tab: "persona"`），不参加召回 |
| `cues` | write_scene 的 cues | 召回线索，1–8 条，每条 ≤80 字 |
| `status: "archived"` | 归档 | 不进提示词、不参加召回 |
| `favorite` / `importance` / `domain` / `date` | 收藏 / — / 主域 / 日期 | |
| `source: { type, messageIds }` | 原话绑定 | 来自哪几条聊天消息 |

## 现在（echo 自带后端，已实现）

- `GET /api/memory` → `{ memory: MemoryItem[], reminders }`
- `POST /api/memory` ← `{ kind?, tab?, title?, text, pinned?, cues?, domain?, status?, favorite?, importance?, date?, preference?, source? }` → `MemoryItem`
- `PUT /api/memory/:id` ← 同上任意字段 → `MemoryItem`
- `DELETE /api/memory/:id` → `{ ok: true }`
- `POST /api/memory/recall` ← `{ query: string(1–1000), limit?: 1–20 }` → `{ results: RecallHit[] }`
  - `RecallHit = { id, kind, tab, title, text, score(0–1) }`
  - 没配置向量 / 重排模型：**503** `{ error: "memory_recall_unconfigured", message }`（前端显示「设置 → 记忆检索」）
  - 上游失败：502；超时：504；参数错：400

`kind` 和旧字段 `tab` 双向映射：persona↔persona，event↔summary，scene / preference→text。旧后端不认识的扩展字段会被忽略，不会出错。

## 网关接上时必须提供

网关（Serein 或自建）只要在同源 `/api/*` 下提供**上面这 5 个接口、同样的请求 / 响应形状**，前端不用改。另外：

1. 全部走 echo 的登录会话（Cookie `__Host-echo-session`），未登录回 401 `{ error: "echo_login_required" }`。
2. 写请求校验 `Origin`（和现有后端一致）。
3. `id` 是字符串；`createdAt` / `updatedAt` 是毫秒时间戳。
4. 召回的 `score` 归一化到 0–1，返回前已按重排门槛过滤、按分数降序。
5. 归档（`status: "archived"`）和 `persona` 不参与召回。

如果网关想用自己的路径（例如 Serein 的 `/api/hook/recall`），只改 `lib/memory.ts` 里的 `createMemory / updateMemory / deleteMemory / testRecall` 四个函数，页面不用动。

## 本机模拟（mock）

没开登录（`NEXT_PUBLIC_ECHO_AUTH` 不是 1）且连不上后端时：

- 记忆的增删改只改本机（`lib/store` 的 localStorage 兜底，样例数据在 `lib/mock.ts` 的 `seedMemory`）；
- 召回测试用 `mockRecall` 按字面重合打分，页面会标出「本机模拟」。

登录模式下不会静默退回本机，失败会直接提示。

## Echo 与 Serein 共用记忆库

同机运行时，给 Echo 后端设置 `ECHO_SEREIN_DATABASE` 为 Serein 正在使用的 SQLite 记忆库绝对路径，`ECHO_SEREIN_PYTHON` 为能够导入该版本 serein 包的 Python 路径。请核对路径，使用 Serein 的数据库备份流程保存快照，再重启 Echo。首次启动把旧 Echo 条目导入为场景，按原条目 ID 去重，保留旧 JSON 和提醒。此适配器在 Serein 43dfa5b 上验证。保留生产站的 Echo 登录保护。

记忆本打开、返回前台、手动刷新及在前台停留每 30 秒都会重新读取。修改采用 Serein 的版本和索引队列。页面的“已连接”表示数据库读通；向量索引完成时间取决于 Serein 的索引进程。事件修订沿用 Serein 的来源记录，叙事修订需保留来源引用。

项目说明默认指向 shukuiz/echo-pwa 的 feat/echo-memory-rerank-api 分支。后端可用 ECHO_PROJECT_REPO 和 ECHO_PROJECT_BRANCH 选择目标。根目录 CLAUDE.md 导入 AGENTS.md。在启用 Echo 登录的后端配置仅对目标仓库拥有 Contents 读写权限的 ECHO_PROJECT_TOKEN 后，页面可以保存到该分支。GitHub 会检测文件版本冲突。客户端拉取该分支后，两种工具可读取同一份说明。
