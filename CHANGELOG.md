# 更新公告

App 里的「更新公告」（设置 → 关于 → 更新公告）和这里是同一份内容，来源 `lib/version.ts`。
每次给 App 推一次完整更新：在 `lib/version.ts` 加一段、把 `APP_VERSION` 和 `public/sw.js` 的缓存名一起升级。

## v0.10.0 · 2026-11-25

用 ChatGPT 订阅和 echo 聊天 ✿

1. **新的聊天连接：Codex（ChatGPT 订阅）**
   设置 → 聊天连接 里多了「Codex（ChatGPT 订阅）」。选它以后，echo 通过服务器上的 Codex 用 ChatGPT 订阅回复，不用填 API Key；可以选模型、思考强度、要不要显示思考
2. **Codex 记得住这段对话**
   Codex 自己保管对话上下文，每次只把新说的那句交给它；点「新对话」从头开始，echo 里的聊天记录不会删
3. **思考、停止、重新生成都能用**
   思考摘要放进回复上方的「思考」；停止会中断 Codex 这一轮；重新生成会先撤掉上一轮（thread/revert）再重新问
4. **记忆走 Serein**
   Codex 通过 MCP 用 Serein 的 recall_memory / write_scene，设置里能看到 Serein 有没有接上
5. **说明书可以在 App 里改了**
   设置 → 说明书：查看、修改、保存、恢复默认 echo 的 AGENTS.md（同时写 CLAUDE.md）。普通接口下一条消息生效；Codex 只在开新对话时读，保存后会问要不要开
6. **在 App 里登录 ChatGPT**
   Codex 没登录时，点「登录 ChatGPT」拿一次性设备码去网页输入，密码不经过 echo

技术细节：Service Worker 缓存 `echo-v11`（`echo-v10` 已被 v0.9.1 用掉）；后端新增 `backend/src/codex.js`（常驻 `codex app-server`，JSON-RPC over stdio，echo 自己的实现）、`backend/src/routes/codex.js`（`GET /api/codex/status`、`GET /api/codex/models`、`POST /api/codex/thread/reset`、`POST /api/codex/login`、`POST /api/codex/login/cancel`、`GET/PUT /api/manual`、`POST /api/manual/reset`）；设置新增 `apiMode: "codex"` 和 `codex: { model, effort, showThinking }`；对话 id 存在 `data/memory/settings/codex-thread.json`。部署说明见 `backend/README.md` 的「Codex 连接」。

## v0.9.1 · 2026-11-25

思考翻译与保持登录

1. 原生思考可保存风格偏好。Cloudflare 翻译接通后，只翻译思考字段里的英文，并保存译文。
2. Echo 移除独立检索配置和召回测试入口，记忆检索在 Serein 配置。
3. Echo 登录记录保存到磁盘，保持设备登录 30 天。Serein 网关的对应补丁在 scripts/serein-web-session.patch，需应用后才生效。

## v0.9.0 · 2026-11-25

这次更新了这些 ✿

1. **之前没送到的那批，终于到了**
   美化页的「保存」和云端备份、更清楚的液态玻璃、顶部让出刘海、聊天长按菜单和多选、重新生成、收藏本、新的记忆本，这次都装上啦
2. **重点色，一个颜色管到底**
   秒针、头像小星星、提醒铃铛、日历「今天」、开关和保存按钮，都从你选的重点色里取深浅和邻近色，统一又不单调
3. **美化页收拾整齐了**
   分成风格、颜色、玻璃参数、字体、壁纸、外观几组，收起来也能看到当前选的是什么；顶部有个小预览，改哪项哪块就亮一下；右上角也能直接保存
4. **选了「仿真」能存住了**
   保存后会读回来核对一遍，云端备份冲突时以你手动保存的为准，重开、重新添加到主屏幕都还是仿真
5. **echo 会「想一想」了**
   设置 → 思考 里可以选 关 / 原生思考 / 强制思考；强制思考的提示词就摆在那里，想怎么改都行。思考过程在回复上方，可以默认展开或折叠，不会被带进下一轮

技术细节：Service Worker 缓存 `echo-v9`；后端新增 `backend/src/thinking.js`、`POST /api/settings/thinking-preview`；美化回归测试 `npm run test:beauty`（见 `scripts/beauty-save-test.py`）。
