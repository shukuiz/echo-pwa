# Echo 项目记忆（跨会话）

> 给任何新会话的 AI：接手 echo 相关任务前先读这份。它解决「换个对话框就不认识项目」的问题。
> 维护方式：有重大变更时追加，不要整篇重写。最近更新 2026-11-27。

## 项目是什么

echo 是用户的个人 AI 陪伴 PWA：前端 Next.js 部署在 Vercel，后端 Fastify 跑在用户自己的 VPS 上，可切换「普通 API 模式」与「Codex 模式」（调用本机 codex CLI）。用户一个人用，偏向简单、不折腾、不为功能引入额外存储。

## 机器与目录（最容易搞错的一条）

- VPS：`agent@187.53.84.149`，2 核 / 2GB / **无 swap**，已开免密 sudo。
- **线上后端真实位置** `/root/companion/echo-service`，systemd 单元 `echo-backend`，端口 8787，**以 root 运行**。
- `~/echo-pwa` 只是前端副本。改后端必须改 `/root/companion/echo-service` 那一份，并 `systemctl restart echo-backend`。
- 判断「改的是副本还是线上」的方法是看 systemd 单元的 `WorkingDirectory`，不要凭目录名猜。

## 网络出口（决定 Codex 能不能用）

- VPS 在香港葵涌（Ctcsci Tech），**整个 IP 段被 Cloudflare 拉黑**：`chatgpt.com` 与 `api.openai.com` 一律 403，返回 WAF 页「If you are using a VPN, try turning it off」。
- **Cloudflare WARP 无效**：其香港出口在同一黑名单，换境外接入点直接连不上。已卸载，别重装。
- 解法：本地代理 `socks5h://127.0.0.1:7890`（用户自配，2026-11-27 验证 Codex 恢复）。
- 后端通过 `/etc/systemd/system/echo-backend.service.d/proxy.conf`（600 权限）持久化代理环境变量。
- 两个硬约束：必须 `socks5h://`（远端解析）而非 `socks5://`；`NO_PROXY=127.0.0.1,localhost,::1` 不能删，否则后端连不上本机 serein MCP（127.0.0.1:18217），Codex 直接废。

## Codex 使用规则

- `codex exec` 必须带 `--sandbox workspace-write`。默认 `read-only` 时 `apply_patch` 全被拒，表现为「一直在读文件、从不产出改动」。
- **绝不用 `timeout` 硬杀**：只杀前台客户端，任务半途死，还会留 `codex app-server` 孤儿进程。
- 一次只跑一个任务（2GB 无 swap，并发即 OOM）。
- 任务书写成工单：点名改哪几个文件、逐条要求、给验收命令。指令含糊会让它读文件读满超时。
- 额度查法：读 `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` 里的 `rate_limits`（`used_percent`、`resets_at`）。agent 与 root 两个用户 account_id 相同，共用一份周额度。
- 2026-11-27 快照：已用 11%，重置 12-01 21:50。

## 仓库与发布

- 仓库 `shukuiz/echo-pwa`（公开）。**生产分支 `feat/echo-window`**，不是 main；工作分支 `feat/echo-memory-rerank-api`。
- 生产域名 `echo-pwa-eight.vercel.app`，Vercel 项目 `echo-pwa`，推分支后自动部署。
- **判断线上版本只看 `https://echo-pwa-eight.vercel.app/sw.js` 里的 `echo-vNN`**，别看页面文字：CDN 会缓存几十小时，页面看着新其实是旧的。
- 历史坑：曾出现「生产 deployment 被钉住」，推分支只生成 Preview，必须 Promote to Production 才切别名。2026-11-27 后恢复自动跟随。
- 推送需要 GitHub token。**不要在对话里贴 token**，也不要写进脚本或仓库。

## 版本三件套（每次发版必须同时改）

1. `lib/version.ts`：`APP_VERSION` 递增 + `CHANGELOG` 顶部插一条
2. `lib/release.ts`：`version` / `title` / `changes`，驱动更新弹窗
3. `public/sw.js`：`const CACHE = "echo-vNN"` 递增，否则手机上永远拿旧缓存

漏掉第 3 条最常见：代码上线了，手机端还是旧版。

## 已实现功能与实现口径

- **分气泡**：只拆 AI 回复，≤120 字且 ≤5 句才按句拆，逐个冒出带停顿；`settings.splitBubbles` 可关。
- **收图**：前端 `compressImage` 长边≤1280、JPEG 0.78；base64 只随单次请求走，**不入库、不落盘、不写 localStorage**。后端按接口类型输出 `image_url`（chat/completions）或 `input_image`（responses）两种多模态格式，历史消息里的图不重发。
- **文件收发**：`/api/attach/extract`，文本直读、`pdf-parse@2.4.5`（v1 在 Node 22 加载失败）、`mammoth` 读 docx；上限 3MB / 20 万字；文件读完即弃，不存储；无文字层 PDF 明确报错而非塞乱码给模型。
- **语音**：MiniMax TTS `t2a_v2` / ASR `speech_to_text`，key 与 GroupId 在**设置 → 语音**由用户自己填。录音不使用 MediaRecorder（MiniMax 不收 webm），自写 PCM→16k 单声道 WAV，60 秒自动停，iOS 需先 `resume()` AudioContext。
- **思考翻译**：完全免费，不消耗用户模型额度。主用 Google `clients5.google.com/translate_a/t`，兜底 MyMemory；`needsTranslation` 对中文直接跳过；前端**展开思考框才发请求**，结果缓存，可切「看原文 / 看译文」。旧的 Cloudflare 方案是死代码，已删除。
- **思考框修复**：`backend/src/thinking.js` 的 `ThinkSplitter.push()` 在 `this.started === true` 时必须保留 `<think>` / `</think>` 原样，否则正文会断在「不过」。

## 沟通与交付习惯

- 用户要**结论 + 表格**，不要长篇；术语翻成大白话（他明确说过「说人话」）。
- 他明确提过的边界：功能接在 echo 里、别为存图复杂化、MiniMax 的 key 由他自己在设置页填、做完要发更新公告（`lib/release.ts`）。
- 改完后端必须重启服务并**实测一条**，不要只报「已部署」。
