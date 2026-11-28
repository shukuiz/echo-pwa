# Echo 项目约定

## 开工前先读

**`docs/PROJECT-MEMORY.md`** —— 机器目录、网络出口、Codex 规则、发版三件套、已实现功能与口径。
新会话不要重新问「echo 是什么」「后端在哪」，先读这份。

三条最容易出错的：

- 线上后端在 VPS `/root/companion/echo-service`（root 跑，`echo-backend`，8787）；`~/echo-pwa` 只是前端副本。
- VPS 香港 IP 段被 Cloudflare 拉黑，访问 ChatGPT 必须走 `socks5h://127.0.0.1:7890`，`NO_PROXY` 要留本地地址。
- 发版必须同时改 `lib/version.ts`、`lib/release.ts`、`public/sw.js`（`echo-vNN` 递增）。

## 更新公告

每次更新都在 lib/release.ts 写一条用户能看懂的更新公告，并更换版本标识。写清用户在哪里能看到变化，以及哪些功能需要后端接通。

更新公告统一使用 lib/version.ts 和 components/UpdateNotes.tsx，首页和设置使用同一个公告。lib/release.ts 保留本次交付记录。
