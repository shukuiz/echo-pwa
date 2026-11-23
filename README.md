# echo · 手机竖屏 PWA

Next.js 14 (App Router) + Tailwind CSS。P0 已接入轻量后端（`backend/`）：聊天真转发、记忆与聊天记录存后端，Key 只存后端。

## 运行
```bash
npm install
npm run dev          # 开发：http://localhost:3000
npm run build && npm start   # 生产（Service Worker 只在生产模式注册）
```
手机上用 Safari 打开 → 分享 → 添加到主屏幕，即以独立 App 方式运行。

## 后端（P0）
见 [`backend/README.md`](backend/README.md)。启动后端后，在设置页填 API Key（或本地代理地址）即可真聊天；记忆本新增/改/删/置顶都落到后端。

## 目录
- app/page.tsx            桌面：状态栏、echo 状态胶囊、控制中心组件、图标网格、Dock
- app/chat                聊天：流式逐字、停止生成、失败重试、轻触气泡复制/删除
- app/workbench           工作台（P1 接入工具，P0 未动）
- app/memory              记忆本：人设 / 文字记忆 / 今日总结 / 提醒，增删改、置顶、导出 JSON 备份（自动剔除 Key）
- app/reminders           记事提醒：一句话解析时间（lib/parseTime.ts）
- app/settings            设置：API Key + 代理地址（只存后端）、Codex / Claude Code 开关、测试连接（真实请求）、浅/深色
- components/Chrome.tsx   状态栏、返回按钮、Home 指示条、底部面板、开关、分段选择
- lib/api.ts              后端 API 封装（聊天流式 / 记忆 / 文件 / 设置）
- lib/store.tsx           全局状态；启动时从后端拉取，localStorage 作离线兜底
- backend/                轻量后端（Fastify，4 GiB 常开）

## P0 验收
1. 后端跑起来，手机浏览器能打开小手机，填 Key 后能真聊天。
2. 改一条记忆，下一条回复就用上；刷新/重启后端不丢，可导出备份。
