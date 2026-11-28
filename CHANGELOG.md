# 更新公告

App 里的「更新公告」（设置 → 关于 → 更新公告）和这里是同一份内容，来源 `lib/version.ts`。
每次给 App 推一次完整更新：在 `lib/version.ts` 加一段、把 `APP_VERSION` 和 `public/sw.js` 的缓存名一起升级。

## v0.14.0 · 2026-11-28

能打电话了 ✿

1. **打电话**
   聊天右上角多了电话按钮，点开是全屏通话页：echo 头像外面有会呼吸的光，不用按住，说完停一秒它就听懂接话，它说话时你一开口就能打断；挂断后聊天里留一条「通话 3:12」，点开看文字记录。原来的「对讲机」收掉了
2. **语音条会动了**
   echo 的语音变成波形语音条，播到哪亮到哪，点波形能跳；文字收进「转文字」，想看再点开
3. **截图黑白气泡**
   聊天截图改成黑白气泡；echo 自己截图时可以决定截几条（1 到 30 条）；多选消息后底部多了「截成图」，只截你勾的那几条
4. **译文不挤在气泡里**
   译文移到气泡下面，设置里多了「翻译显示」：气泡下小字 / 点开才看 / 不显示
5. **头像排整齐了**
   连续几条只显示一个头像，贴在第一条气泡顶上；隔了 5 分钟以上，中间居中显示时间
6. **小动作不限次数**
   echo 发语音、截图、记记忆、发文件不再有「一天一两次」的限制，想用就用

技术细节：Service Worker 缓存 `echo-v25`。新组件 `components/chat/CallScreen.tsx`；后端新增 `POST /api/chat/call-log`，`/api/chat` 支持 `call: true`（短句口语、不带小动作、不落盘）；小动作提示词合并到 `backend/src/echo-actions-hint.js`。

## v0.11.0 · 2026-11-25

换窗，和不会断的回复 ✿

1. **换窗**（更新点 4）
   聊天页右上角「换窗」：当前主模型先写窗影（我眼中的你 / 我眼中的自己 / 这一窗发生的事，存进 Serein，和 MCP `window_shadow_write` 同一个功能），旧窗口归档进「历史窗口」只读保存，新窗口带新的 `X-Serein-Window-ID`。连续性：Serein 网关下新窗口第一条消息带 `/resume`（之后每轮都把这条当锚点放在最前面）；Codex 下开新线程并用 `thread/inject_items` 预装资料（按 Serein `docs/codex-continuity-packet.md`）；其它接口把资料放进这一窗的系统提示。换窗页可选资料（最新窗影、最近 Event / Scene / 原话各 1–50 条默认 10、收藏的 Scene、尚未整理的原话、自选），可预览，最新窗影只读展示。窗影写失败会停下来问：重试 / 不写直接换；任何一步失败旧聊天都在原处
2. **回复不被打断**（更新点 1）
   每次生成带请求 ID（genId），只更新对应消息；离开页面 / 切后台 / 网络断一下，后端照样写完并落盘，回来按 genId 接上；只有「停止」（`POST /api/chat/stop`）才取消。生成中换模型，这一条用旧模型写完。首字超时（普通 60 秒 / Codex 90 秒）、中途卡住 60 秒、总时长 10 分钟，到点结束并保留已写的字。报错分类：登录过期 / 额度用完 / 网络或隧道断开 / 上游拒绝参数 / 超时，附「重试 / 去设置 / 重新登录」。设置 → 回复等待 可改时长
3. **iPhone 液态玻璃回来了**（更新点 2）
   iPhone 默认「均衡」：DPR ≤1.5、缓冲区约 100 万像素、壁纸纹理 ≤2048 只传一次、只在变化时重画、水波 30 帧、键盘弹出时暂停；防闪退保险（开 WebGL 前记标记，稳定 10 秒擦掉；下次还在 = 上次闪退 → 这次用 CSS 并轻提示；连续两次一直用 CSS，直到手动选画质）；WebGL 丢失也退 CSS。美化 → 玻璃参数 新增「玻璃画质：高清 / 均衡 / 省电」。CSS 回退：模糊更轻、加边缘高光
4. **代码规矩**（更新点 3）
   记忆本顶部的「项目说明」挪到 设置 → 开发，改名「代码规矩」（给写代码的 AI 看，不是 echo 人设），液态玻璃样式，保存前确认「会直接提交到仓库」

技术细节：Service Worker 缓存 `echo-v13`。后端新增 `src/generations.js`、`src/reply-errors.js`、`src/timeouts.js`、`src/chat-store.js`（写入排队、原子写）、`src/windows-store.js`、`src/windows.js`、`src/serein-client.js`、`src/routes/windows.js`；新接口 `GET /api/chat/active`、`GET /api/chat/generations/:genId`、`POST /api/chat/stop`、`GET /api/windows`、`GET /api/windows/:id`、`GET /api/windows/shadow/latest`、`POST /api/windows/preview`、`GET /api/windows/candidates`、`POST /api/windows/switch`。窗口登记表 `data/memory/windows/index.json`，归档在 `data/memory/windows/<id>.json`，当前窗口仍是 `data/memory/chat.json`（多了 `windowId`）。Serein 需要打开「窗影」「开窗续接」和 /resume 命令；后端通过 `ECHO_SEREIN_CORE_URL`（默认 `http://127.0.0.1:18218`）+ `ECHO_SEREIN_TOKEN_FILE`（或 `ECHO_CODEX_SEREIN_TOKEN_FILE`）访问 Serein。

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
